// Calendar months in UTC, as ISO dates. offset 0 = this month.
export function monthBounds(offset = 0, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return {
    start: start.toISOString().slice(0, 10),
    next: next.toISOString().slice(0, 10),
    label: start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

export function fmtDate(iso: string | null | undefined, withYear = false) {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: iso.length === 10 ? "UTC" : "Africa/Dar_es_Salaam" });
}

export function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dar_es_Salaam" });
}

// "3 hours ago", "2 days ago", then a date.
export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) { const h = Math.floor(s / 3600); return `${h} hour${h > 1 ? "s" : ""} ago`; }
  if (s < 7 * 86400) { const d = Math.floor(s / 86400); return `${d} day${d > 1 ? "s" : ""} ago`; }
  return fmtDate(iso);
}

export function money(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

// ISO timestamp for `days` days ago (for "last 30 days" filters).
export function daysAgo(days: number) {
  return new Date(Date.now() - days * 864e5).toISOString();
}
