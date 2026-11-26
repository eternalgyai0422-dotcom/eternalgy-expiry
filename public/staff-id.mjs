// 员工名字 → 登入用的内部 email；4 位 PIN → 登入密码（Supabase 要求密码最少 6 个字）
// 网页和服务器都用同一套规则
export const STAFF_DOMAIN = "staff.cert-roadtax.app";

export function normName(name) {
  return String(name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function staffEmail(name) {
  const bytes = new TextEncoder().encode(normName(name));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `s${hex}@${STAFF_DOMAIN}`;
}

export function staffPassword(pin) {
  return `ety#${pin}#cr`;
}
