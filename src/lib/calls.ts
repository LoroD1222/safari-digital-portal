// Cold calling: phone numbers, reading uploaded lists, scripts and stats.
// No database here, so it can be tested on its own.

export type CallStatus = "new" | "retry" | "callback" | "interested" | "not_interested" | "wrong_number" | "unreachable" | "dnc";
export type Outcome = "no_answer" | "callback" | "interested" | "not_interested" | "wrong_number";

export type CallList = { id: string; name: string; script: string | null; archived: boolean; created_at: string };
export type CallContact = {
  id: string; list_id: string; company: string | null; contact_name: string | null; phone: string; email: string | null;
  website: string | null; city: string | null; status: CallStatus; attempts: number; next_call_at: string | null;
  last_called_at: string | null; last_outcome: Outcome | null; claimed_by: string | null; claimed_at: string | null;
  inquiry_id: string | null; created_at: string;
};
export type CallLog = { id: string; contact_id: string; list_id: string | null; user_id: string | null; outcome: Outcome; note: string | null; created_at: string };
export type CallSettings = {
  default_script: string | null; daily_target: number; whatsapp_intro: string | null; interested_subject: string | null; interested_body: string | null;
  case_study_url: string | null; case_study_name: string | null;
};

export const OUTCOMES: { key: Outcome; label: string; hint: string }[] = [
  { key: "no_answer", label: "No answer", hint: "Tries again tomorrow" },
  { key: "callback", label: "Call back", hint: "Pick a day and time" },
  { key: "interested", label: "Interested", hint: "Pipeline + meeting" },
  { key: "not_interested", label: "Not interested", hint: "Out of the queue" },
  { key: "wrong_number", label: "Wrong number", hint: "Out of the queue" },
];
export const OUTCOME_LABEL: Record<Outcome, string> = Object.fromEntries(OUTCOMES.map((o) => [o.key, o.label])) as Record<Outcome, string>;
export const STATUS_LABEL: Record<CallStatus, string> = {
  new: "Not called yet", retry: "Try again", callback: "Call back", interested: "Interested", not_interested: "Not interested",
  wrong_number: "Wrong number", unreachable: "Unreachable", dnc: "Do not call",
};
export const OPEN_STATUSES: CallStatus[] = ["new", "retry", "callback"];
// Reached = someone picked up and talked to us.
export const REACHED: Outcome[] = ["callback", "interested", "not_interested"];
export const CLAIM_MINUTES = 15;

// ───────────── Phone numbers ─────────────

// Tanzanian numbers by default: 0754 123 456 → +255754123456. Returns null when it isn't a phone number.
export function normalizePhone(raw: unknown, country = "255"): string | null {
  let s = String(raw ?? "").trim();
  if (!s) return null;
  // Excel sometimes turns numbers into 2.55754E+11; we can't trust those digits.
  if (/e\+?\d+$/i.test(s)) return null;
  s = s.replace(/\s*(ext|x)\.?\s*\d+$/i, "");
  const plus = s.startsWith("+");
  let d = s.replace(/\D/g, "");
  if (!d) return null;
  if (!plus) {
    if (d.startsWith("00")) d = d.slice(2);
    else if (d.startsWith("0") && d.length === 10) d = country + d.slice(1);
    else if (d.length === 9 && /^[67]/.test(d)) d = country + d;
  }
  return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
}

// +255754123456 → "+255 754 123 456"
export function prettyPhone(p: string) {
  const m = p.match(/^\+255(\d{3})(\d{3})(\d{3})$/);
  return m ? `+255 ${m[1]} ${m[2]} ${m[3]}` : p;
}

export function waLink(phone: string, text?: string) {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

// ───────────── Reading uploaded files ─────────────

// RFC 4180-ish CSV: quotes, "" inside quotes, commas or semicolons (Excel in some countries), CRLF.
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : (firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",");
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c));
}

const unxml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, "&");
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

// The first sheet of an .xlsx file, from its unzipped XML parts.
export function readXlsxSheet(sheetXml: string, sharedXml: string | null): string[][] {
  const shared = sharedXml ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unxml(t[1])).join("")) : [];
  const rows: string[][] = [];
  for (const r of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], inner = c[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="(\w+)"/)?.[1];
      let v = "";
      if (type === "inlineStr") v = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unxml(t[1])).join("");
      else {
        const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        v = type === "s" ? shared[Number(raw)] ?? "" : unxml(raw);
      }
      const idx = ref ? colIndex(ref) : row.length;
      while (row.length < idx) row.push("");
      row[idx] = v.trim();
    }
    if (row.some((x) => x)) rows.push(row);
  }
  return rows;
}

export type Field = "company" | "contact_name" | "phone" | "email" | "website" | "city" | "skip";
export const FIELDS: { key: Field; label: string }[] = [
  { key: "company", label: "Company" }, { key: "contact_name", label: "Contact name" }, { key: "phone", label: "Phone" },
  { key: "email", label: "Email" }, { key: "website", label: "Website" }, { key: "city", label: "City" }, { key: "skip", label: "Don't import" },
];
const GUESS: [Field, RegExp][] = [
  ["phone", /phone|mobile|simu|tel|whats|namba|number|cell/i],
  ["email", /e-?mail|barua/i],
  ["website", /web|site|url|domain/i],
  ["contact_name", /contact|owner|person|manager|first|^name$|full name|jina/i],
  ["company", /company|business|operator|hotel|lodge|organi[sz]ation|brand|name/i],
  ["city", /city|town|location|region|address|mji|area/i],
];

// Which column is what, from the header row (falls back to looking at the values).
export function guessMapping(header: string[], sample: string[][] = []): Field[] {
  const used = new Set<Field>();
  const out = header.map((h) => {
    const f = GUESS.find(([k, re]) => !used.has(k) && re.test(h))?.[0] ?? "skip";
    if (f !== "skip") used.add(f);
    return f;
  });
  if (!used.has("phone")) {
    const i = header.findIndex((_, i) => out[i] === "skip" && sample.length > 0 && sample.filter((r) => normalizePhone(r[i])).length >= Math.ceil(sample.length / 2));
    if (i >= 0) out[i] = "phone";
  }
  return out;
}

export type ImportRow = { company: string | null; contact_name: string | null; phone: string; email: string | null; website: string | null; city: string | null };

// Rows ready to save, plus what was left out and why.
export function buildImport(rows: string[][], mapping: Field[], skipPhones: Set<string>) {
  const ok: ImportRow[] = [];
  let noPhone = 0, duplicate = 0, known = 0;
  const seen = new Set<string>();
  const get = (r: string[], f: Field, max: number) => {
    const i = mapping.indexOf(f);
    const v = i >= 0 ? String(r[i] ?? "").trim().slice(0, max) : "";
    return v || null;
  };
  for (const r of rows) {
    const phone = normalizePhone(get(r, "phone", 60));
    if (!phone) { noPhone++; continue; }
    if (seen.has(phone)) { duplicate++; continue; }
    seen.add(phone);
    if (skipPhones.has(phone)) { known++; continue; }
    const email = get(r, "email", 200);
    ok.push({
      company: get(r, "company", 200), contact_name: get(r, "contact_name", 200), phone,
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null,
      website: get(r, "website", 300), city: get(r, "city", 120),
    });
  }
  return { rows: ok, noPhone, duplicate, known };
}

// ───────────── Scripts and messages ─────────────

export const DEFAULT_SCRIPT = `Open
Hello, good morning. Am I speaking with the owner of {{company}}?
(Client: Yes.)

Introduce yourself
Hi, my name is Christina. I'm calling from Safari Digital, we're a marketing agency based here in Arusha.

What we do
We build websites for safari companies and run Facebook and Instagram ads to help them get more inquiries from tourists in the USA.

Question
I just wanted to ask, are you currently doing any online advertising for your company?
(Client: Yes / No / Sometimes.)

Why I'm calling
Okay, I see. The reason I'm calling is we're working with other tour operators here in Tanzania, and I wanted to see if this might be something useful for your business as well.`

export const DEFAULT_WHATSAPP = `Hello {{first_name}}, it's {{agent_name}} from {{our_company}} in Arusha. I tried calling you just now. We build websites and run Facebook and Instagram ads that help safari companies like {{company}} get more inquiries from tourists. When is a good time for a quick 5-minute call?`;
export const DEFAULT_SUBJECT = "Great speaking with you, {{first_name}}";
export const DEFAULT_BODY = `Hi {{first_name}},

Thanks for your time on the phone today.

As promised, I've attached a short case study showing how we helped another Tanzanian tour operator get more inquiries from tourists.

Have a look when you have a moment, and let me know if any questions come up. I'm happy to walk you through it on a short call.`;

export type ScriptVars = { contact?: string | null; company?: string | null; agent?: string | null; ourCompany?: string | null; city?: string | null };

export function firstNameOf(full: string | null | undefined) {
  const f = String(full ?? "").trim().split(/\s+/)[0] ?? "";
  return f.length >= 2 && !/[@\d]/.test(f) ? f.charAt(0).toUpperCase() + f.slice(1) : null;
}

// Fills {{first_name}} {{company}} {{agent_name}} {{our_company}} {{city}}; never leaves a tag behind.
export function fillTemplate(text: string, v: ScriptVars) {
  const first = firstNameOf(v.contact);
  let out = text;
  if (!first) out = out.replace(/\b(hi|hello|hey|dear)\s+\{\{\s*first_name\s*\}\}\s*([,?!])/gi, (_, w: string, p: string) => `${w}${p === "," ? "," : p}`)
    .replace(/,\s*is this \{\{\s*first_name\s*\}\}\?/gi, ", am I speaking with the owner or manager?");
  return out
    .replace(/\{\{\s*first_name\s*\}\}/gi, first ?? "there")
    .replace(/\{\{\s*company\s*\}\}/gi, v.company?.trim() || "your company")
    .replace(/\{\{\s*agent_name\s*\}\}/gi, v.agent?.trim() || "the team")
    .replace(/\{\{\s*our_company\s*\}\}/gi, v.ourCompany?.trim() || "Safari Digital")
    .replace(/\{\{\s*city\s*\}\}/gi, v.city?.trim() || "Tanzania");
}

// A script as blocks: a short title line followed by what to say.
export function scriptSteps(script: string) {
  return script.trim().split(/\n\s*\n/).map((b) => {
    const [first, ...rest] = b.trim().split("\n");
    return rest.length ? { title: first.trim(), say: rest.join("\n").trim() } : { title: "", say: first.trim() };
  }).filter((s) => s.say);
}

// ───────────── Time (Tanzania, EAT = UTC+3) ─────────────

export const eatDate = (iso: string | number | Date) => new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString().slice(0, 10);
export const eatHour = (iso: string) => new Date(Date.parse(iso) + 3 * 3600e3).getUTCHours();
export const eatTime = (iso: string) => new Date(Date.parse(iso) + 3 * 3600e3).toISOString().slice(11, 16);
export const eatToIso = (date: string, time: string) => new Date(`${date}T${time}:00+03:00`).toISOString();

// "Thu 26 Nov" — built by hand so the server and the browser print the same thing.
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function shortDay(date: string) {
  const d = new Date(`${date}T12:00:00Z`);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
}

// "Today 14:00", "Tomorrow 09:00", "Thu 26 Nov 11:00"
export function whenLabel(iso: string, now = Date.now()) {
  const d = eatDate(iso), today = eatDate(now), tomorrow = eatDate(now + 864e5);
  const day = d === today ? "Today" : d === tomorrow ? "Tomorrow" : shortDay(d);
  return `${day} ${eatTime(iso)}`;
}

// ───────────── Stats ─────────────

export type HourStat = { hour: number; calls: number; reached: number; rate: number };
export type ListStat = { id: string; name: string; total: number; called: number; open: number; reached: number; interested: number; calls: number; rate: number };

export function callStats(logs: Pick<CallLog, "outcome" | "created_at" | "list_id" | "contact_id">[], opts: { from: number; until?: number }) {
  const inRange = logs.filter((l) => { const t = Date.parse(l.created_at); return t >= opts.from && (opts.until == null || t < opts.until); });
  const hours = new Map<number, HourStat>();
  for (let h = 8; h <= 18; h++) hours.set(h, { hour: h, calls: 0, reached: 0, rate: 0 });
  for (const l of inRange) {
    const h = eatHour(l.created_at);
    const s = hours.get(h) ?? { hour: h, calls: 0, reached: 0, rate: 0 };
    s.calls++; if (REACHED.includes(l.outcome)) s.reached++;
    hours.set(h, s);
  }
  const byHour = [...hours.values()].sort((a, b) => a.hour - b.hour).map((s) => ({ ...s, rate: s.calls ? s.reached / s.calls : 0 }));
  // The best hour needs a few calls behind it, or one lucky call wins.
  const best = byHour.filter((s) => s.calls >= 3).sort((a, b) => b.rate - a.rate || b.calls - a.calls)[0] ?? null;
  const calls = inRange.length;
  const reached = inRange.filter((l) => REACHED.includes(l.outcome)).length;
  const interested = inRange.filter((l) => l.outcome === "interested").length;
  return { byHour, best, calls, reached, interested, rate: calls ? reached / calls : 0 };
}

export function listStats(lists: Pick<CallList, "id" | "name">[], contacts: Pick<CallContact, "list_id" | "status" | "attempts">[], logs: Pick<CallLog, "list_id" | "outcome">[]): ListStat[] {
  return lists.map((l) => {
    const cs = contacts.filter((c) => c.list_id === l.id);
    const ls = logs.filter((x) => x.list_id === l.id);
    const reached = ls.filter((x) => REACHED.includes(x.outcome)).length;
    return {
      id: l.id, name: l.name, total: cs.length,
      called: cs.filter((c) => c.attempts > 0 || !OPEN_STATUSES.includes(c.status)).length,
      open: cs.filter((c) => OPEN_STATUSES.includes(c.status)).length,
      reached, interested: ls.filter((x) => x.outcome === "interested").length, calls: ls.length,
      rate: ls.length ? reached / ls.length : 0,
    };
  });
}

// The server's clock, read outside render code.
export const nowMs = () => Date.now();

export const pct = (n: number) => `${Math.round(n * 100)}%`;
