// 管理员用：新增员工 / 重设 PIN / 删除员工（只有管理员可以叫这个功能）
import { staffEmail, staffPassword, normName, STAFF_DOMAIN } from "../../public/staff-id.mjs";

const env = (k) => (process.env[k] || "").trim();
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

function sbHeaders(key) {
  const h = { apikey: key, "Content-Type": "application/json" };
  if (!key.startsWith("sb_")) h.Authorization = `Bearer ${key}`;
  return h;
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const SB_URL = env("SUPABASE_URL").replace(/\/$/, "");
  const SB_KEY = env("SUPABASE_SECRET_KEY");
  if (!SB_URL || !SB_KEY) return json({ error: "Netlify 还没设定 SUPABASE_URL / SUPABASE_SECRET_KEY" }, 500);
  const H = sbHeaders(SB_KEY);

  // 1) 确认叫这个功能的人是管理员
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "没有登入" }, 401);
  const meRes = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } });
  if (!meRes.ok) return json({ error: "登入已过期，请重新登入" }, 401);
  const me = await meRes.json();
  const adm = await fetch(`${SB_URL}/rest/v1/app_admins?select=email&email=ilike.${encodeURIComponent(me.email || "")}`, { headers: H });
  const admRows = adm.ok ? await adm.json() : [];
  if (!admRows.length) return json({ error: "只有管理员可以管理员工" }, 403);

  let body = {};
  try { body = await req.json(); } catch {}
  const { action } = body;

  // 2) 列出全部员工
  if (action === "list") {
    const out = [];
    for (let page = 1; page <= 10; page++) {
      const r = await fetch(`${SB_URL}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: H });
      if (!r.ok) return json({ error: `读取员工失败 (${r.status})` }, 500);
      const data = await r.json();
      const users = data.users || [];
      for (const u of users) {
        if ((u.email || "").endsWith("@" + STAFF_DOMAIN)) {
          out.push({ id: u.id, name: u.user_metadata?.name || "", last_sign_in_at: u.last_sign_in_at || null, created_at: u.created_at });
        }
      }
      if (users.length < 200) break;
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return json({ staff: out });
  }

  const pinOk = (p) => /^\d{4}$/.test(String(p || ""));

  // 3) 新增员工
  if (action === "create") {
    const name = String(body.name || "").trim().replace(/\s+/g, " ");
    if (!normName(name)) return json({ error: "请填名字" }, 400);
    if (name.length > 20) return json({ error: "名字太长（最多 20 个字）" }, 400);
    if (!pinOk(body.pin)) return json({ error: "PIN 要 4 位数字" }, 400);
    const r = await fetch(`${SB_URL}/auth/v1/admin/users`, {
      method: "POST", headers: H,
      body: JSON.stringify({ email: staffEmail(name), password: staffPassword(body.pin), email_confirm: true, user_metadata: { name, role: "staff" } }),
    });
    if (!r.ok) {
      const t = await r.text();
      if (/already|exists|registered/i.test(t)) return json({ error: `已经有一个叫「${name}」的员工` }, 409);
      return json({ error: `新增失败：${t.slice(0, 200)}` }, 500);
    }
    return json({ ok: true });
  }

  // 4) 重设 PIN
  if (action === "reset") {
    if (!body.id || !pinOk(body.pin)) return json({ error: "PIN 要 4 位数字" }, 400);
    const r = await fetch(`${SB_URL}/auth/v1/admin/users/${encodeURIComponent(body.id)}`, {
      method: "PUT", headers: H, body: JSON.stringify({ password: staffPassword(body.pin) }),
    });
    if (!r.ok) return json({ error: `重设失败：${(await r.text()).slice(0, 200)}` }, 500);
    return json({ ok: true });
  }

  // 5) 删除员工
  if (action === "delete") {
    if (!body.id) return json({ error: "缺少员工" }, 400);
    const u = await fetch(`${SB_URL}/auth/v1/admin/users/${encodeURIComponent(body.id)}`, { headers: H });
    const user = u.ok ? await u.json() : null;
    if (!user || !(user.email || "").endsWith("@" + STAFF_DOMAIN)) return json({ error: "只能删除员工账号" }, 400);
    const r = await fetch(`${SB_URL}/auth/v1/admin/users/${encodeURIComponent(body.id)}`, { method: "DELETE", headers: H });
    if (!r.ok) return json({ error: `删除失败：${(await r.text()).slice(0, 200)}` }, 500);
    return json({ ok: true });
  }

  return json({ error: "unknown action" }, 400);
};

export const config = { path: "/api/staff" };
