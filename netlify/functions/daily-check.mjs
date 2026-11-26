// 每天早上 9 点（马来西亚时间）自动检查，有快到期的就发 WhatsApp
import { pickDue, buildMessages, todayInMY } from "../lib/reminder.mjs";

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

export default async () => {
  const SB_URL = env("SUPABASE_URL").replace(/\/$/, "");
  const SB_KEY = env("SUPABASE_SECRET_KEY");
  const to = recipients();
  if (!SB_URL || !SB_KEY || !to.length) {
    console.error("缺少环境变量：SUPABASE_URL / SUPABASE_SECRET_KEY / CALLMEBOT_PHONE / CALLMEBOT_APIKEY");
    return new Response("missing env", { status: 500 });
  }

  const res = await fetch(`${SB_URL}/rest/v1/records?archived=eq.false&select=id,category,title,holder,expiry_date,notified_stage,archived`, { headers: sbHeaders(SB_KEY) });
  if (!res.ok) {
    console.error("读取 Supabase 失败", res.status, await res.text());
    return new Response("supabase error", { status: 500 });
  }
  const records = await res.json();
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
      headers: { ...sbHeaders(SB_KEY), Prefer: "return=minimal" },
      body: JSON.stringify({ notified_stage: String(r.stage) }),
    });
  }
  return new Response(`sent ${due.length}`);
};

// 01:00 UTC = 马来西亚早上 9:00
export const config = { schedule: "0 1 * * *" };
