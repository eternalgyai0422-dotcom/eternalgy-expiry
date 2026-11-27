// 每天早上 9 点（马来西亚时间）自动执行：
// 1) 清掉垃圾桶里超过 100 天的记录和文件
// 2) 有快到期的就发 WhatsApp（有设定 CallMeBot 才会发）
import { pickDue, buildMessages, todayInMY } from "../lib/reminder.mjs";
import { planPurge } from "../lib/trash.mjs";

const env = (k) => (process.env[k] || "").trim();

function sbHeaders(key) {
  const h = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_")) h.Authorization = `Bearer ${key}`; // 旧式 service_role key
  return h;
}

function recipients() {
  // 支持一个或多个号码：CALLMEBOT_PHONE + CALLMEBOT_APIKEY，或 CALLMEBOT_RECIPIENTS="+6012xxx:key1,+6019xxx:key2"
  const list = [];
  if (env("CALLMEBOT_PHONE") && env("CALLMEBOT_APIKEY")) list.push({ phone: env("CALLMEBOT_PHONE"), apikey: env("CALLMEBOT_APIKEY") });
  for (const pair of env("CALLMEBOT_RECIPIENTS").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [phone, apikey] = pair.split(":").map((s) => s.trim());
    if (phone && apikey) list.push({ phone, apikey });
  }
  return list;
}

async function sendWhatsApp({ phone, apikey }, text) {
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&apikey=${encodeURIComponent(apikey)}&text=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  const body = await res.text();
  if (!res.ok || /apikey is invalid|error/i.test(body)) throw new Error(`CallMeBot 失败 (${res.status}): ${body.replace(/<[^>]+>/g, " ").slice(0, 200)}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function purgeTrash(SB_URL, H, records) {
  const { deleteRecords, trimFiles } = planPurge(records);
  const removeObjects = async (paths) => {
    if (!paths.length) return;
    await fetch(`${SB_URL}/storage/v1/object/documents`, { method: "DELETE", headers: H, body: JSON.stringify({ prefixes: paths }) });
  };
  for (const d of deleteRecords) {
    const r = await fetch(`${SB_URL}/rest/v1/records?id=eq.${d.id}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
    if (r.ok) await removeObjects(d.paths);
  }
  for (const t of trimFiles) {
    const r = await fetch(`${SB_URL}/rest/v1/records?id=eq.${t.id}`, {
      method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ trash_files: t.keep }),
    });
    if (r.ok) await removeObjects(t.paths);
  }
  if (deleteRecords.length || trimFiles.length) console.log(`垃圾桶：永久删除 ${deleteRecords.length} 项记录，清理 ${trimFiles.length} 项的旧文件`);
}

export default async () => {
  const SB_URL = env("SUPABASE_URL").replace(/\/$/, "");
  const SB_KEY = env("SUPABASE_SECRET_KEY");
  if (!SB_URL || !SB_KEY) {
    console.error("缺少环境变量：SUPABASE_URL / SUPABASE_SECRET_KEY");
    return new Response("missing env", { status: 500 });
  }
  const H = sbHeaders(SB_KEY);

  const res = await fetch(`${SB_URL}/rest/v1/records?select=*`, { headers: H });
  if (!res.ok) {
    console.error("读取 Supabase 失败", res.status, await res.text());
    return new Response("supabase error", { status: 500 });
  }
  const all = await res.json();

  // 1) 垃圾桶
  try { await purgeTrash(SB_URL, H, all); } catch (e) { console.error("清理垃圾桶失败：", e.message); }

  // 2) WhatsApp 提醒
  const to = recipients();
  if (!to.length) { console.log("还没设定 WhatsApp（CALLMEBOT_PHONE / CALLMEBOT_APIKEY），跳过提醒"); return new Response("no whatsapp configured"); }

  const records = all.filter((r) => !r.deleted_at && !r.archived && r.expiry_date && !(r.extra && r.extra.resolved_date)); // 已删除 / 停用 / 没到期日 / 罚款已解决 → 不提醒
  const today = todayInMY();
  const due = pickDue(records, today);
  console.log(`${today}: 共 ${records.length} 项，今天要提醒 ${due.length} 项`);
  if (!due.length) return new Response("nothing due");

  const msgs = buildMessages(due, today, env("APP_URL") || env("URL"));
  let anyOk = false;
  for (const r of to) {
    try {
      for (let i = 0; i < msgs.length; i++) {
        if (i) await sleep(4000);
        await sendWhatsApp(r, msgs[i]);
      }
      anyOk = true;
      console.log("已发送给", r.phone);
    } catch (e) {
      console.error("发送给", r.phone, "失败：", e.message);
    }
  }
  if (!anyOk) return new Response("whatsapp failed", { status: 502 }); // 没有成功就不记录，明天会再试

  // 记录已经提醒到哪一个阶段，避免每天重复发
  for (const r of due) {
    await fetch(`${SB_URL}/rest/v1/records?id=eq.${r.id}`, {
      method: "PATCH",
      headers: { ...H, Prefer: "return=minimal" },
      body: JSON.stringify({ notified_stage: String(r.stage) }),
    });
  }
  return new Response(`sent ${due.length}`);
};

// 01:00 UTC = 马来西亚早上 9:00
export const config = { schedule: "0 1 * * *" };
