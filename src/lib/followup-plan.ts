// Works out what the automatic follow-ups do next for one inquiry.
// Pure (no database, no clock of its own) so the sender, the screens and the tests all agree.

import type { FollowupRule, FollowupStage } from "./followup-presets";

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const GAP_AFTER_AUTO = 40 * HOUR;      // never two automatic emails within ~2 days
export const GAP_AFTER_MANUAL = 72 * HOUR;    // a message the operator sent pushes the next one back 3 days
export const MAX_LATE = 7 * DAY;              // a step more than a week overdue (e.g. the system was down) is skipped
export const MAX_ATTEMPTS = 3;                // provider errors are retried on the next runs, then given up
export const WINDOW = { startHour: 9, endHour: 17 }; // Monday–Friday, guest's local time

export type CycleStatus = "awaiting" | "active" | "paused" | "replied" | "ended";
export type Cycle = {
  id: string; stage: FollowupStage; started_at: string; confirmed_at: string | null; last_operator_at: string | null;
  status: CycleStatus; pause_reason: string | null; resumed_at: string | null;
};
export type SendStatus = "scheduled" | "sending" | "sent" | "failed" | "canceled" | "skipped";
export type SendRow = {
  cycle_id: string | null; step_key: string | null; channel: string; status: SendStatus; attempts: number;
  sent_at: string | null; created_at: string;
};
export type PlanInput = {
  now: number;
  settings: { enabled: boolean; enabled_at: string | null; quote_valid_days: number | null; senderReady: boolean };
  maxSends: number;                   // the template's total: an inquiry never gets more automatic emails than this
  rules: FollowupRule[];              // the client's rules (all stages)
  cycle: Cycle | null;
  sends: SendRow[];                   // every email send row for this inquiry (all cycles)
  inquiry: { email: string | null; stopped: boolean; suppressed: boolean; travelDates: string | null; country: string | null };
  timezone: string;                   // fallback (the operator's) time zone
};

export type PlanState =
  | "off" | "no_email" | "stopped" | "none" | "awaiting" | "paused" | "replied"
  | "trip_passed" | "quote_expired" | "limit" | "done" | "scheduled";

export type Plan = {
  state: PlanState;
  label: string;                      // short status for screens
  next: { rule: FollowupRule; dueAt: number; sendNow: boolean; attempt: number } | null;
  skip: { rule: FollowupRule; reason: string }[]; // steps to record as skipped (never sent late)
  remaining: number;                  // steps still to come in this stage
  timezone: string;
};

// ───────────── Time zones and the sending window ─────────────

// Only countries with a single time zone: anything else uses the operator's fallback.
const COUNTRY_TZ: Record<string, string> = {
  "united kingdom": "Europe/London", uk: "Europe/London", gb: "Europe/London", england: "Europe/London", scotland: "Europe/London", wales: "Europe/London",
  ireland: "Europe/Dublin", ie: "Europe/Dublin", germany: "Europe/Berlin", de: "Europe/Berlin", deutschland: "Europe/Berlin",
  france: "Europe/Paris", fr: "Europe/Paris", netherlands: "Europe/Amsterdam", nl: "Europe/Amsterdam", "the netherlands": "Europe/Amsterdam",
  belgium: "Europe/Brussels", be: "Europe/Brussels", switzerland: "Europe/Zurich", ch: "Europe/Zurich", austria: "Europe/Vienna", at: "Europe/Vienna",
  italy: "Europe/Rome", it: "Europe/Rome", poland: "Europe/Warsaw", pl: "Europe/Warsaw", sweden: "Europe/Stockholm", se: "Europe/Stockholm",
  norway: "Europe/Oslo", no: "Europe/Oslo", denmark: "Europe/Copenhagen", dk: "Europe/Copenhagen", finland: "Europe/Helsinki", fi: "Europe/Helsinki",
  "czech republic": "Europe/Prague", czechia: "Europe/Prague", cz: "Europe/Prague", slovenia: "Europe/Ljubljana", si: "Europe/Ljubljana",
  croatia: "Europe/Zagreb", hr: "Europe/Zagreb", hungary: "Europe/Budapest", hu: "Europe/Budapest", greece: "Europe/Athens", gr: "Europe/Athens",
  israel: "Asia/Jerusalem", il: "Asia/Jerusalem", "united arab emirates": "Asia/Dubai", uae: "Asia/Dubai", ae: "Asia/Dubai",
  india: "Asia/Kolkata", in: "Asia/Kolkata", singapore: "Asia/Singapore", sg: "Asia/Singapore", japan: "Asia/Tokyo", jp: "Asia/Tokyo",
  china: "Asia/Shanghai", cn: "Asia/Shanghai", "south africa": "Africa/Johannesburg", za: "Africa/Johannesburg",
  kenya: "Africa/Nairobi", ke: "Africa/Nairobi", tanzania: "Africa/Dar_es_Salaam", tz: "Africa/Dar_es_Salaam",
  uganda: "Africa/Kampala", ug: "Africa/Kampala", rwanda: "Africa/Kigali", rw: "Africa/Kigali", nigeria: "Africa/Lagos", ng: "Africa/Lagos",
  "new zealand": "Pacific/Auckland", nz: "Pacific/Auckland",
};

export function guestTimezone(country: string | null | undefined, fallback: string) {
  const k = (country ?? "").toLowerCase().replace(/[.]/g, "").trim();
  return COUNTRY_TZ[k] ?? fallback;
}

function parts(t: number, tz: string) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
  const o = Object.fromEntries(f.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, min: +o.minute, wd: o.weekday as string };
}

// The UTC time of a wall-clock time in a time zone (handles daylight saving).
export function zonedTime(y: number, m: number, d: number, h: number, tz: string) {
  let t = Date.UTC(y, m - 1, d, h);
  for (let i = 0; i < 2; i++) {
    const p = parts(t, tz);
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    t += Date.UTC(y, m - 1, d, h) - shown;
  }
  return t;
}

const WEEKEND = new Set(["Sat", "Sun"]);

// The first moment at or after t that's inside Monday–Friday 9:00–17:00 in tz.
export function nextSendTime(t: number, tz: string) {
  let at = t;
  for (let i = 0; i < 10; i++) {
    const p = parts(at, tz);
    if (!WEEKEND.has(p.wd) && p.h >= WINDOW.startHour && p.h < WINDOW.endHour) return at;
    // Jump to 9:00 today if it's early, else 9:00 the next day; then check the weekday again.
    const startToday = zonedTime(p.y, p.m, p.d, WINDOW.startHour, tz);
    if (!WEEKEND.has(p.wd) && p.h < WINDOW.startHour) return startToday;
    const next = new Date(Date.UTC(p.y, p.m - 1, p.d) + DAY);
    at = zonedTime(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), WINDOW.startHour, tz);
  }
  return at;
}

export function inWindow(t: number, tz: string) {
  return nextSendTime(t, tz) === t;
}

// ───────────── Travel dates ─────────────

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// The last day of the guest's travel dates, if the text says clearly; otherwise null (never guessed).
export function travelEnd(text: string | null | undefined): number | null {
  const s = (text ?? "").toLowerCase();
  if (!s.trim()) return null;
  const ends: number[] = [];
  for (const m of s.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) ends.push(Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59));
  for (const m of s.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/g)) ends.push(Date.UTC(+m[3], +m[2] - 1, +m[1], 23, 59)); // day/month/year
  for (const m of s.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(?:\d{1,2}(?:st|nd|rd|th)?,?\s*)?(20\d{2})\b/g)) {
    const mi = MONTHS.indexOf(m[1]);
    ends.push(Date.UTC(+m[2], mi + 1, 0, 23, 59)); // end of that month
  }
  for (const m of s.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(20\d{2})\b/g)) {
    ends.push(Date.UTC(+m[3], MONTHS.indexOf(m[2]), +m[1], 23, 59));
  }
  return ends.length ? Math.max(...ends) : null;
}

// ───────────── The plan ─────────────

const DONE: SendStatus[] = ["sent", "sending", "skipped", "canceled"];

export function planFollowups(i: PlanInput): Plan {
  const tz = guestTimezone(i.inquiry.country, i.timezone);
  const base = { next: null, skip: [], remaining: 0, timezone: tz };
  const c = i.cycle;
  if (!i.settings.enabled) return { ...base, state: "off", label: "Follow-ups are off" };
  if (!c || c.status === "ended") return { ...base, state: "none", label: "No follow-ups in this stage" };
  const stageRules = i.rules.filter((r) => r.enabled && r.stage === c.stage).sort((a, b) => a.days - b.days);
  const mine = i.sends.filter((s) => s.cycle_id === c.id && s.channel === "email");
  const isDone = (r: FollowupRule) => mine.some((s) => s.step_key === r.id && (DONE.includes(s.status) || (s.status === "failed" && s.attempts >= MAX_ATTEMPTS)));
  const open = stageRules.filter((r) => !isDone(r));
  const remaining = open.length;
  const withRemaining = { ...base, remaining };

  if (i.inquiry.stopped) return { ...withRemaining, state: "stopped", label: "Stopped for this guest" };
  if (i.inquiry.suppressed) return { ...withRemaining, state: "stopped", label: "Stopped: this email address bounced or opted out" };
  if (c.status === "awaiting") return { ...withRemaining, state: "awaiting", label: "Waiting for you to confirm you sent the message" };
  if (c.status === "replied") return { ...withRemaining, state: "replied", label: "Paused: guest replied" };
  if (c.status === "paused") return { ...withRemaining, state: "paused", label: c.pause_reason || "Paused" };
  if (!i.inquiry.email || !i.settings.senderReady) return { ...withRemaining, state: "no_email", label: !i.inquiry.email ? "No email address: WhatsApp only" : "Email not connected yet" };
  const tripEnd = travelEnd(i.inquiry.travelDates);
  if (tripEnd !== null && tripEnd < i.now) return { ...withRemaining, state: "trip_passed", label: "Paused: the travel dates have passed" };
  const anchor = new Date(c.confirmed_at!).getTime();
  if (c.stage === "quoted" && i.settings.quote_valid_days && i.now > anchor + i.settings.quote_valid_days * DAY) {
    return { ...withRemaining, state: "quote_expired", label: "Paused: the quote has expired, review and resend it" };
  }
  const sentTotal = i.sends.filter((s) => s.channel === "email" && (s.status === "sent" || s.status === "sending")).length;
  if (sentTotal >= i.maxSends) return { ...withRemaining, state: "limit", label: "All follow-ups for this guest have been sent" };
  if (!open.length) return { ...withRemaining, state: "done", label: "All follow-ups for this stage have been sent" };

  // Steps due before follow-ups were switched on, resumed, or before their timing changed are skipped, never backfilled.
  const ts = (s: string | null | undefined) => (s ? new Date(s).getTime() : 0);
  const floorFor = (r: FollowupRule) => Math.max(anchor, ts(i.settings.enabled_at), ts(c.resumed_at), ts(r.timing_changed_at), ts(r.created_at));
  const skip: Plan["skip"] = [];
  const candidates: FollowupRule[] = [];
  for (const r of open) {
    const due = anchor + r.days * DAY;
    const retrying = mine.some((s) => s.step_key === r.id && s.status === "failed");
    if (!retrying && due < floorFor(r)) skip.push({ rule: r, reason: "Was due before follow-ups started, resumed or changed" });
    else if (!retrying && due < i.now - MAX_LATE) skip.push({ rule: r, reason: "More than a week late" });
    else candidates.push(r);
  }
  if (!candidates.length) return { ...base, skip, remaining: 0, state: "done", label: "All follow-ups for this stage have been sent" };

  const rule = candidates[0];
  const lastAuto = Math.max(0, ...i.sends.filter((s) => s.channel === "email" && s.sent_at && (s.status === "sent" || s.status === "sending")).map((s) => ts(s.sent_at)));
  const manual = ts(c.last_operator_at);
  let earliest = anchor + rule.days * DAY;
  if (lastAuto) earliest = Math.max(earliest, lastAuto + GAP_AFTER_AUTO);
  if (manual > anchor) earliest = Math.max(earliest, manual + GAP_AFTER_MANUAL);
  const dueAt = nextSendTime(earliest, tz);
  const failed = mine.find((s) => s.step_key === rule.id && s.status === "failed");
  return {
    state: "scheduled", label: "Scheduled", skip, remaining: candidates.length, timezone: tz,
    next: { rule, dueAt, sendNow: i.now >= dueAt && inWindow(i.now, tz), attempt: (failed?.attempts ?? 0) + 1 },
  };
}
