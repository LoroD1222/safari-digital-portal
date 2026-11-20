// Appointments (internal account only). Times are Tanzania time (EAT, UTC+3, no daylight saving),
// computed by hand so the server and the browser always show the same thing.

export type Appointment = {
  id: string; client_id: string; inquiry_id: string | null; title: string; starts_at: string; duration_min: number;
  kind: "online" | "in_person"; meeting_link: string | null; location: string | null; notes: string | null;
  status: "scheduled" | "done" | "no_show" | "canceled"; invite_sent_at: string | null;
};
export const APPT_STATUS: Record<Appointment["status"], string> = { scheduled: "Scheduled", done: "Done", no_show: "No show", canceled: "Canceled" };
export const DURATIONS = [15, 30, 45, 60, 90, 120];

const EAT = 3 * 3600_000;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const LONG_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-11-24" + "10:30" (Tanzania time) → ISO instant
export function eatToIso(date: string, time: string) {
  return new Date(Date.parse(`${date}T${time}:00+03:00`)).toISOString();
}
// ISO instant → Tanzania date, time and parts
export function eat(iso: string) {
  const d = new Date(Date.parse(iso) + EAT);
  const date = d.toISOString().slice(0, 10), time = d.toISOString().slice(11, 16);
  return { date, time, minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), weekday: (d.getUTCDay() + 6) % 7, day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear() };
}
export function todayEat(now = Date.now()) {
  return new Date(now + EAT).toISOString().slice(0, 10);
}
// Monday of the week containing date (YYYY-MM-DD)
export function weekStart(date: string) {
  const t = Date.parse(date + "T00:00:00Z");
  const wd = (new Date(t).getUTCDay() + 6) % 7;
  return new Date(t - wd * 86400_000).toISOString().slice(0, 10);
}
export function addDays(date: string, n: number) {
  return new Date(Date.parse(date + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);
}
export function dayLabel(date: string) {
  const d = new Date(date + "T00:00:00Z");
  return `${DAYS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
export function longWhen(iso: string, durationMin: number) {
  const s = eat(iso), e = eat(new Date(Date.parse(iso) + durationMin * 60_000).toISOString());
  return `${LONG_DAYS[s.weekday]} ${s.day} ${LONG_MONTHS[s.month]} ${s.year}, ${s.time}–${e.time} (Tanzania time, EAT)`;
}
export function weekLabel(monday: string) {
  const a = new Date(monday + "T00:00:00Z"), b = new Date(Date.parse(monday + "T00:00:00Z") + 6 * 86400_000);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${LONG_MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}`
    : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

// "Add to Google Calendar" link
export function googleCalendarUrl(a: Pick<Appointment, "title" | "starts_at" | "duration_min" | "kind" | "meeting_link" | "location" | "notes">) {
  const fmt = (t: number) => new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = Date.parse(a.starts_at);
  const where = a.kind === "online" ? a.meeting_link ?? "" : a.location ?? "";
  const p = new URLSearchParams({
    action: "TEMPLATE", text: a.title, dates: `${fmt(start)}/${fmt(start + a.duration_min * 60_000)}`,
    details: [a.kind === "online" && a.meeting_link ? `Join: ${a.meeting_link}` : "", a.notes ?? ""].filter(Boolean).join("\n\n"), location: where,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

// Two appointments overlap (for the clash warning)
export function overlaps(a: Pick<Appointment, "starts_at" | "duration_min">, b: Pick<Appointment, "starts_at" | "duration_min">) {
  const s1 = Date.parse(a.starts_at), e1 = s1 + a.duration_min * 60_000, s2 = Date.parse(b.starts_at), e2 = s2 + b.duration_min * 60_000;
  return s1 < e2 && s2 < e1;
}
