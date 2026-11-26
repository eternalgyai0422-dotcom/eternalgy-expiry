// 提醒逻辑（每天检查用）
// 阶段：1 = 30天内，2 = 7天内，3 = 到期当天/刚过期，4+ = 过期后每7天再提醒一次
export function daysBetween(fromStr, toStr) {
  const p = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(toStr) - p(fromStr)) / 86400000);
}

export function stageFor(daysLeft) {
  if (daysLeft > 30) return 0;
  if (daysLeft > 7) return 1;
  if (daysLeft > 0) return 2;
  return 3 + Math.floor(-daysLeft / 7); // 0..-6 → 3, -7..-13 → 4 ...
}

export function todayInMY(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const fmt = (s) => { const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; };

// 找出今天需要提醒的记录
export function pickDue(records, today) {
  const due = [];
  for (const r of records) {
    if (r.archived || !r.expiry_date) continue;
    const d = daysBetween(today, r.expiry_date);
    const stage = stageFor(d);
    const last = Number(r.notified_stage) || 0;
    if (stage > 0 && stage > last) due.push({ ...r, daysLeft: d, stage });
  }
  return due.sort((a, b) => a.daysLeft - b.daysLeft);
}

export function buildMessages(due, today, siteUrl, maxLen = 1400) {
  const line = (r) => {
    const who = r.holder ? ` (${r.holder})` : "";
    const when = r.daysLeft < 0 ? `过期 ${-r.daysLeft} 天` : r.daysLeft === 0 ? "今天到期" : `剩 ${r.daysLeft} 天`;
    return `• ${r.title}${who} — ${when}，${fmt(r.expiry_date)} [${r.category}]`;
  };
  const groups = [
    ["🔴 已过期 / 今天到期", due.filter((r) => r.daysLeft <= 0)],
    ["🟠 7天内到期", due.filter((r) => r.daysLeft > 0 && r.daysLeft <= 7)],
    ["🟡 30天内到期", due.filter((r) => r.daysLeft > 7)],
  ].filter(([, list]) => list.length);

  const header = `📅 *Eternalgy 到期提醒* (${fmt(today)})`;
  const footer = siteUrl ? `\n\n👉 续期后请在系统按「续期」更新：${siteUrl}` : "";
  const blocks = groups.flatMap(([title, list]) => [`\n${title}`, ...list.map(line)]);

  // 太长就分几条发
  const msgs = [];
  let cur = header;
  for (const b of blocks) {
    if ((cur + "\n" + b).length > maxLen) { msgs.push(cur); cur = header + " (续)"; }
    cur += "\n" + b;
  }
  msgs.push(cur + footer);
  return msgs;
}
