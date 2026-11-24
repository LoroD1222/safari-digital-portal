"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/icons";
import {
  CLAIM_MINUTES, DEFAULT_SCRIPT, DEFAULT_WHATSAPP, OPEN_STATUSES, OUTCOMES, OUTCOME_LABEL, REACHED,
  eatDate, fillTemplate, prettyPhone, scriptSteps, waLink, whenLabel,
  type CallContact, type CallList, type CallLog, type CallSettings, type Outcome,
} from "@/lib/calls";
import { logCall, nextCall, openCall, releaseCalls, type Current } from "./actions";
import { ImportDialog } from "./import-dialog";
import { ContactForm } from "./contact-form";
import { ListsTab } from "./lists-tab";
import { StatsTab } from "./stats-tab";
import { SettingsTab } from "./settings-tab";

export type Tab = "calling" | "lists" | "stats" | "settings";
export type Sender = { ready: boolean; email: string | null; agent: string | null; company: string };
export type Dnc = { phone: string; reason: string | null; created_at: string };

const TAB_LABEL: Record<Tab, string> = { calling: "Calling", lists: "Lists", stats: "Stats", settings: "Settings" };

export function CallsView(p: {
  tab: Tab; range: number; now: number; me: string; names: Record<string, string>;
  lists: CallList[]; contacts: CallContact[]; logs: CallLog[]; dnc: Dnc[]; settings: CallSettings; sender: Sender; hasMeetingDefaults: boolean;
}) {
  const router = useRouter();
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const today = eatDate(p.now);
  const todays = p.logs.filter((l) => eatDate(l.created_at) === today);
  const mine = todays.filter((l) => l.user_id === p.me).length;
  const reached = todays.filter((l) => REACHED.includes(l.outcome)).length;
  const callbacksDue = p.contacts.filter((c) => c.status === "callback" && c.next_call_at && Date.parse(c.next_call_at) <= p.now).length;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Cold calling</h1>
          <p className="text-body">Upload a list, work through the calls, and send anyone interested straight to the Pipeline. Times are Tanzania time (EAT).</p>
        </div>
        <Button className="h-9" onClick={() => setImporting(true)}><Icon name="upload" size={16} />Upload list</Button>
      </div>

      <nav aria-label="Cold calling" className="flex gap-1 border-b border-line">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <Link key={t} href={t === "calling" ? "/portal/calls" : `/portal/calls?tab=${t}`} scroll={false} aria-current={p.tab === t ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 pb-2.5 pt-1 text-sm font-medium no-underline ${p.tab === t ? "border-brand text-ink" : "border-transparent text-slate hover:text-ink"}`}>
            {TAB_LABEL[t]}
          </Link>
        ))}
      </nav>

      {toast && <Alert tone="success">{toast}</Alert>}

      {p.tab === "calling" && (
        <>
          <section aria-label="Today" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <div className="flex flex-col gap-1 rounded-card border border-line px-[18px] py-4">
              <span className="text-[13px] text-slate">Calls today</span>
              <span className="text-[28px] font-semibold leading-tight tracking-[-0.03em] tabular-nums">{todays.length}<span className="text-[15px] font-medium tracking-normal text-slate"> / {p.settings.daily_target}</span></span>
              <div className="my-1 h-1.5 overflow-hidden rounded-full bg-[#EEF0F2]" role="progressbar" aria-label="Daily target" aria-valuemin={0} aria-valuemax={p.settings.daily_target} aria-valuenow={todays.length}>
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.round((todays.length / p.settings.daily_target) * 100))}%` }} />
              </div>
              <span className="text-xs text-slate">{mine} by you</span>
            </div>
            <Mini label="Picked up" value={String(reached)} note={todays.length ? `${Math.round((reached / todays.length) * 100)}% of calls` : "No calls yet today"} />
            <Mini label="Interested" value={String(todays.filter((l) => l.outcome === "interested").length)} note="Added to the Pipeline" />
            <Mini label="Callbacks due" value={String(callbacksDue)} note="These come first" />
          </section>
          <Calling {...p} onToast={setToast} onImport={() => setImporting(true)} />
        </>
      )}
      {p.tab === "lists" && <ListsTab lists={p.lists} contacts={p.contacts} logs={p.logs} onToast={setToast} onImport={() => setImporting(true)} />}
      {p.tab === "stats" && <StatsTab range={p.range} now={p.now} lists={p.lists} contacts={p.contacts} logs={p.logs} names={p.names} />}
      {p.tab === "settings" && <SettingsTab settings={p.settings} dnc={p.dnc} sender={p.sender} onToast={setToast} />}

      {importing && (
        <ImportDialog lists={p.lists.filter((l) => !l.archived)} onClose={() => setImporting(false)}
          onDone={(m) => { setImporting(false); setToast(m); router.refresh(); }} />
      )}
    </>
  );
}

function Mini({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line px-[18px] py-4">
      <span className="text-[13px] text-slate">{label}</span>
      <span className="text-[28px] font-semibold leading-tight tracking-[-0.03em] tabular-nums">{value}</span>
      <span className="text-xs text-slate">{note}</span>
    </div>
  );
}

type Row = CallContact & { lockedBy: string | null };

function Calling(p: Parameters<typeof CallsView>[0] & { onToast: (m: string | null) => void; onImport: () => void }) {
  const router = useRouter();
  const [list, setList] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null); // null = all, "" = not set
  const [cur, setCur] = useState<Current | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);
  const [missed, setMissed] = useState<CallContact | null>(null);
  const [pending, start] = useTransition();
  const active = useMemo(() => new Set(p.lists.filter((l) => !l.archived).map((l) => l.id)), [p.lists]);
  const listName = useMemo(() => Object.fromEntries(p.lists.map((l) => [l.id, l.name])), [p.lists]);

  // Keep the queue fresh, so you see what colleagues are calling.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(t);
  }, [router]);

  const lockedBy = (c: CallContact) =>
    c.claimed_by && c.claimed_by !== p.me && c.claimed_at && p.now - Date.parse(c.claimed_at) < CLAIM_MINUTES * 60_000 ? p.names[c.claimed_by] ?? "A colleague" : null;
  const inCountry = (c: CallContact) => country === null || (country === "" ? !c.country : c.country === country);
  const countries = [...new Set(p.contacts.filter((c) => OPEN_STATUSES.includes(c.status)).map((c) => c.country ?? ""))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));
  const open: Row[] = p.contacts.filter((c) => OPEN_STATUSES.includes(c.status) && active.has(c.list_id) && (!list || c.list_id === list) && inCountry(c)).map((c) => ({ ...c, lockedBy: lockedBy(c) }));
  const isDue = (c: CallContact) => !c.next_call_at || Date.parse(c.next_call_at) <= p.now;
  const byTime = (a: CallContact, b: CallContact) => Date.parse(a.next_call_at ?? a.created_at) - Date.parse(b.next_call_at ?? b.created_at);
  const groups = [
    { key: "callback", label: "Callbacks due", dot: "#5B7BE0", rows: open.filter((c) => c.status === "callback" && isDue(c)).sort(byTime) },
    { key: "retry", label: "Up next", dot: "#E0A458", rows: open.filter((c) => c.status === "retry" && isDue(c)).sort(byTime) },
    { key: "new", label: "Not called yet", dot: "#8A8FA3", rows: open.filter((c) => c.status === "new") },
    { key: "later", label: "Later", dot: "#C9CDD6", rows: open.filter((c) => c.status !== "new" && !isDue(c)).sort(byTime) },
  ].filter((g) => g.rows.length);
  const counts = (id: string | null) => p.contacts.filter((c) => OPEN_STATUSES.includes(c.status) && active.has(c.list_id) && (!id || c.list_id === id) && inCountry(c) && isDue(c)).length;

  const take = (fn: () => Promise<{ ok: true; current: Current | null } | { ok: false; error: string }>) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) { setError(r.error); return; }
    setCur(r.current); setEmpty(!r.current);
    router.refresh();
  });
  const startNext = (skip?: string) => take(() => nextCall(list, skip ?? null, country));
  const pick = (id: string) => take(async () => { const r = await openCall(id); return r.ok ? { ok: true as const, current: r.current } : r; });
  const stop = () => start(async () => { await releaseCalls(); setCur(null); router.refresh(); });

  if (!p.lists.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-field px-5 py-12 text-center">
        <span className="text-[15px] font-semibold">Upload your first call list</span>
        <span className="max-w-md text-slate">A CSV or Excel file with one company per row. Only a phone number is needed; company, contact, email, website, address, city and country are picked up if they&apos;re there.</span>
        <Button className="mt-2" onClick={p.onImport}><Icon name="upload" size={16} />Upload list</Button>
      </div>
    );
  }

  return (
    <>
      <div role="group" aria-label="Which list" className="flex flex-wrap gap-2">
        {[{ id: null as string | null, name: "All lists" }, ...p.lists.filter((l) => !l.archived)].map((l) => {
          const on = list === l.id;
          return (
            <button key={l.id ?? "all"} type="button" aria-pressed={on} onClick={() => { setList(l.id); setEmpty(false); }}
              className={`h-8 rounded-full border px-3 text-[13px] font-medium ${on ? "border-forest bg-forest text-white" : "border-field bg-white text-ink hover:border-[#C9CDD6]"}`}>
              {l.name} <span className="tabular-nums opacity-70">{counts(l.id)}</span>
            </button>
          );
        })}
        {countries.length > 1 && (
          <Select aria-label="Country" value={country ?? "*"} onChange={(e) => { setCountry(e.target.value === "*" ? null : e.target.value); setEmpty(false); }} className="ml-auto h-8 w-auto rounded-full text-[13px]">
            <option value="*">All countries</option>
            {countries.map((c) => <option key={c || "none"} value={c}>{c || "No country"}</option>)}
          </Select>
        )}
      </div>

      {missed && (
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-[#BFE3CF] bg-[#F1FAF6] px-3.5 py-2.5 text-[13px] text-forest">
          <span className="flex-1">No answer from {missed.company ?? missed.contact_name ?? prettyPhone(missed.phone)}. Send a WhatsApp intro so they know who called?</span>
          <a href={waLink(missed.phone, fillTemplate(p.settings.whatsapp_intro || DEFAULT_WHATSAPP, { contact: missed.contact_name, company: missed.company, agent: p.sender.agent, ourCompany: p.sender.company, city: missed.city }))}
            target="_blank" rel="noopener noreferrer" onClick={() => setMissed(null)}
            className="inline-flex h-8 items-center gap-1.5 rounded-control bg-brand px-3 font-semibold text-white no-underline hover:bg-brand-hover"><Icon name="whatsapp" size={14} />Send WhatsApp intro</a>
          <button type="button" onClick={() => setMissed(null)} className="font-medium text-slate hover:text-ink">Not now</button>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
        <section aria-label="Call queue" className="order-2 overflow-hidden rounded-card border border-line lg:order-1">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="flex items-center gap-2 border-b border-[#EEF0F2] bg-sidebar px-3.5 py-2.5">
                <span className="size-2 rounded-full" style={{ background: g.dot }} />
                <h2 className="text-[13px] font-semibold">{g.label}</h2>
                <span className="text-xs text-slate">{g.rows.length}</span>
              </div>
              <ul>
                {g.rows.slice(0, 40).map((c) => {
                  const isCur = cur?.contact.id === c.id;
                  return (
                    <li key={c.id}>
                      <button type="button" disabled={pending || !!c.lockedBy} onClick={() => pick(c.id)} aria-current={isCur ? "true" : undefined}
                        className={`flex w-full items-center gap-2.5 border-b border-[#F1F2F4] px-3.5 py-2.5 text-left disabled:cursor-not-allowed ${isCur ? "bg-[#F4FAF6] shadow-[inset_3px_0_0_#1A6647]" : "hover:bg-sidebar"} ${c.lockedBy ? "opacity-60" : ""}`}>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-semibold">{c.company ?? c.contact_name ?? prettyPhone(c.phone)}</span>
                          <span className="truncate text-xs text-slate">{[c.contact_name && c.company ? c.contact_name : null, c.city, country === null ? c.country : null, !list ? listName[c.list_id] : null].filter(Boolean).join(" · ") || prettyPhone(c.phone)}</span>
                        </span>
                        <QueueTag c={c} now={p.now} />
                      </button>
                    </li>
                  );
                })}
                {g.rows.length > 40 && <li className="px-3.5 py-2 text-xs text-slate">and {g.rows.length - 40} more</li>}
              </ul>
            </div>
          ))}
          {!groups.length && <p className="px-4 py-8 text-center text-[13px] text-slate">Nothing left to call in this list.</p>}
        </section>

        <div className="order-1 flex min-w-0 flex-col gap-4 lg:order-2">
          {error && <Alert>{error}</Alert>}
          {cur ? (
            <CallCard key={cur.contact.id} cur={cur} p={p} listName={listName[cur.contact.list_id] ?? ""} script={p.lists.find((l) => l.id === cur.contact.list_id)?.script ?? null}
              pending={pending}
              onSkip={() => startNext(cur.contact.id)} onStop={stop}
              onUpdate={(contact) => { setCur({ ...cur, contact }); router.refresh(); }}
              onSaved={(m, outcome) => {
                p.onToast(m);
                setMissed(outcome === "no_answer" ? cur.contact : null);
                startNext();
              }} />
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-card border border-line px-5 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-[#E3F4EA] text-brand"><Icon name="phone" size={20} /></span>
              <span className="text-[15px] font-semibold">{empty ? "Nothing to call right now" : "Ready when you are"}</span>
              <span className="max-w-sm text-slate">{empty ? "Every number is done, waiting for its call back time, or being called by a colleague." : "Start calling and we'll give you the next number: call backs first, then retries, then new numbers. Colleagues never get the same one."}</span>
              {!empty && <Button className="mt-2" disabled={pending} onClick={() => startNext()}><Icon name="phone" size={16} />{pending ? "Getting a number…" : "Start calling"}</Button>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function QueueTag({ c, now }: { c: Row; now: number }) {
  const cls = "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold";
  if (c.lockedBy) return <span className={`${cls} bg-[#F1ECFB] text-[#5B3FA6]`}>{c.lockedBy === "You" ? "You" : `${c.lockedBy} calling`}</span>;
  if (c.status === "callback" && c.next_call_at) return <span className={`${cls} bg-[#E8EEFB] text-[#3450A6]`}>{whenLabel(c.next_call_at, now)}</span>;
  if (c.status === "retry") return <span className={`${cls} bg-[#FCEBDD] text-[#9A4A12]`}>{c.next_call_at && Date.parse(c.next_call_at) > now ? whenLabel(c.next_call_at, now) : `Try ${c.attempts + 1}`}</span>;
  return <span className={`${cls} bg-[#F1F2F4] text-[#4A4F63]`}>New</span>;
}

function CallCard({ cur, p, listName, script, pending, onSkip, onStop, onSaved, onUpdate }: {
  cur: Current; p: Parameters<typeof CallsView>[0]; listName: string; script: string | null; pending: boolean;
  onSkip: () => void; onStop: () => void; onSaved: (message: string, outcome: Outcome) => void; onUpdate: (c: CallContact) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const c = cur.contact;
  const tomorrow = eatDate(p.now + 864e5);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [cbDate, setCbDate] = useState(tomorrow);
  const [cbTime, setCbTime] = useState("10:00");
  const [dnc, setDnc] = useState(false);
  const [name, setName] = useState(c.contact_name ?? "");
  const [email, setEmail] = useState(c.email ?? "");
  const [sendEmail, setSendEmail] = useState(p.sender.ready && !!c.email);
  const [meet, setMeet] = useState(true);
  const [mDate, setMDate] = useState(tomorrow);
  const [mTime, setMTime] = useState("11:00");
  const [mKind, setMKind] = useState<"online" | "in_person">("online");
  const [showScript, setShowScript] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const vars = { contact: c.contact_name, company: c.company, agent: p.sender.agent, ourCompany: p.sender.company, city: c.city, country: c.country };
  const steps = scriptSteps(fillTemplate(script || p.settings.default_script || DEFAULT_SCRIPT, vars));
  const wa = waLink(c.phone, fillTemplate(p.settings.whatsapp_intro || DEFAULT_WHATSAPP, vars));
  const busy = pending || saving;

  const save = () => {
    if (!outcome) return;
    start(async () => {
      setError(null);
      const r = await logCall({
        id: c.id, outcome, note, callbackDate: cbDate, callbackTime: cbTime, dnc,
        name, email, sendEmail: outcome === "interested" && sendEmail,
        meeting: outcome === "interested" && meet ? { date: mDate, time: mTime, kind: mKind } : null,
      });
      if (!r.ok) { setError(r.error); return; }
      const who = c.company ?? c.contact_name ?? prettyPhone(c.phone);
      const m = r.message ?? (outcome === "callback" ? `Call back with ${who} set for ${cbDate === tomorrow ? "tomorrow" : cbDate} at ${cbTime}.`
        : outcome === "no_answer" ? (r.status === "unreachable" ? `${who}: third try with no answer, marked unreachable.` : `${who} comes back tomorrow morning.`)
        : `${who}: ${OUTCOME_LABEL[outcome].toLowerCase()}.`);
      onSaved(m, outcome);
    });
  };

  return (
    <>
      <section aria-label="Current call" className="flex flex-col gap-4 rounded-card border border-line p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
            <span className="text-xs text-slate">{listName} · {c.attempts ? `try ${c.attempts + 1}` : "first call"}</span>
            <h2 className="text-xl font-semibold tracking-[-0.01em]">{c.company ?? c.contact_name ?? "Unknown company"}</h2>
            {(c.contact_name || c.city || c.country) && <span className="text-body">{[c.company ? c.contact_name : null, c.city, c.country].filter(Boolean).join(" · ")}</span>}
            <span className="mt-1.5 text-[26px] font-semibold tabular-nums tracking-[-0.01em]">{prettyPhone(c.phone)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={`tel:${c.phone}`} className="inline-flex h-11 items-center gap-2 rounded-control bg-brand px-[18px] font-semibold text-white no-underline hover:bg-brand-hover"><Icon name="phone" size={17} />Call</a>
            <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-control border border-field px-4 font-semibold text-ink no-underline hover:bg-sidebar"><Icon name="whatsapp" size={16} />WhatsApp</a>
          </div>
        </div>

        {editing ? (
          <ContactForm contact={c} onCancel={() => setEditing(false)} onDone={(m, updated) => { setEditing(false); setSaved(m); if (updated) onUpdate(updated); }} />
        ) : (
          <div className="flex flex-wrap items-start gap-x-5 gap-y-1 rounded-control bg-sidebar px-3 py-2.5 text-[13px] text-body">
            <span><span className="text-slate">Website </span>{c.website ? <a href={/^https?:\/\//.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer">{c.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}</a> : "—"}</span>
            <span><span className="text-slate">Email </span>{c.email ?? "—"}</span>
            <span><span className="text-slate">Address </span>{[c.address, c.city].filter(Boolean).join(", ") || "—"}</span>
            <span><span className="text-slate">Country </span>{c.country ?? "—"}</span>
            <button type="button" onClick={() => { setEditing(true); setSaved(null); }} className="ml-auto font-medium text-brand">Edit details</button>
          </div>
        )}
        {saved && !editing && <p role="status" className="-mt-2 text-xs text-forest">{saved}</p>}

        <section aria-label="Call script" className="flex flex-col gap-2.5 rounded-control border border-line bg-[#FBFCFA] px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold">Script · {listName}</h3>
            <div className="flex items-center gap-3 text-[13px]">
              <Link href={script ? "/portal/calls?tab=lists" : "/portal/calls?tab=settings"}>Edit</Link>
              <button type="button" onClick={() => setShowScript((v) => !v)} className="font-medium text-slate hover:text-ink">{showScript ? "Hide" : "Show"}</button>
            </div>
          </div>
          {showScript && steps.map((s, i) => (
            <div key={i} className="flex gap-3">
              <span className="flex size-[22px] flex-none items-center justify-center rounded-full bg-[#E3F4EA] text-xs font-semibold text-brand">{i + 1}</span>
              <div className="text-[13px]">{s.title && <div className="font-semibold">{s.title}</div>}
                {s.say.split("\n").map((line, j) => /^\(.*\)$/.test(line.trim())
                  ? <div key={j} className="italic text-slate">{line.trim().slice(1, -1)}</div>
                  : <div key={j} className="text-body">{line}</div>)}
              </div>
            </div>
          ))}
        </section>

        {cur.logs.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[13px] font-semibold">Earlier calls</h3>
            {cur.logs.slice(0, 5).map((l) => (
              <div key={l.id} className="flex gap-2.5 text-[13px]">
                <span className="w-[104px] flex-none text-slate">{whenLabel(l.created_at, p.now)}</span>
                <span><strong className="font-semibold">{OUTCOME_LABEL[l.outcome]}</strong>{l.user_id && p.names[l.user_id] ? ` · ${p.names[l.user_id]}` : ""}{l.note ? ` — ${l.note}` : ""}</span>
              </div>
            ))}
          </div>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-semibold">How did it go?</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {OUTCOMES.map((o) => {
              const on = outcome === o.key;
              return (
                <button key={o.key} type="button" aria-pressed={on} onClick={() => setOutcome(o.key)}
                  className={`flex flex-col items-start gap-0.5 rounded-control border px-3 py-2.5 text-left ${on ? "border-brand bg-[#EEF7F1]" : "border-line bg-white hover:border-[#9FD3B6]"}`}>
                  <span className="text-[13px] font-semibold">{o.label}</span>
                  <span className="text-[11px] leading-snug text-slate">{o.hint}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {outcome === "callback" && (
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1 text-[13px] font-medium">Call back on<Input type="date" min={eatDate(p.now)} value={cbDate} onChange={(e) => setCbDate(e.target.value)} /></label>
            <label className="flex flex-col gap-1 text-[13px] font-medium">Time (EAT)<Input type="time" step={900} value={cbTime} onChange={(e) => setCbTime(e.target.value)} /></label>
          </div>
        )}

        {outcome === "not_interested" && (
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={dnc} onChange={(e) => setDnc(e.target.checked)} className="size-4 accent-[#1A6647]" />Never call this number again (adds it to Do not call)</label>
        )}

        {outcome === "interested" && (
          <div className="flex flex-col gap-3 rounded-control border border-[#C6E6D3] bg-[#EEF7F1] p-3.5">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[13px] font-medium">Who you spoke to<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Daniel Mollel" /></label>
              <label className="flex flex-col gap-1 text-[13px] font-medium">Their email<Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (p.sender.ready && e.target.value) setSendEmail(true); }} placeholder="Ask for it on the call" /></label>
            </div>
            <label className="flex items-start gap-2 text-[13px]">
              <input type="checkbox" checked={sendEmail} disabled={!p.sender.ready || !email.trim()} onChange={(e) => setSendEmail(e.target.checked)} className="mt-0.5 size-4 accent-[#1A6647]" />
              <span>Email them now{p.settings.case_study_url ? <> with the case study attached</> : null}
                {!p.sender.ready ? <span className="text-slate"> · connect the email address under <Link href="/portal/followups">Follow-ups</Link> first</span>
                  : !p.settings.case_study_url ? <span className="text-slate"> · add a case study in <Link href="/portal/calls?tab=settings">Settings</Link> to attach it</span> : null}
              </span>
            </label>
            <label className="flex items-center gap-2 text-[13px] font-medium"><input type="checkbox" checked={meet} onChange={(e) => setMeet(e.target.checked)} className="size-4 accent-[#1A6647]" />Book a meeting while they&apos;re on the line</label>
            {meet && (
              <div className="grid gap-2.5 sm:grid-cols-3">
                <label className="flex flex-col gap-1 text-[13px] font-medium">Day<Input type="date" min={eatDate(p.now)} value={mDate} onChange={(e) => setMDate(e.target.value)} /></label>
                <label className="flex flex-col gap-1 text-[13px] font-medium">Time (EAT)<Input type="time" step={900} value={mTime} onChange={(e) => setMTime(e.target.value)} /></label>
                <label className="flex flex-col gap-1 text-[13px] font-medium">Where<Select value={mKind} onChange={(e) => setMKind(e.target.value as "online" | "in_person")}><option value="online">Online (Meet / Zoom)</option><option value="in_person">In person</option></Select></label>
              </div>
            )}
            <span className="text-xs text-forest">
              They go into the Pipeline as Contacted{meet ? ", the meeting goes in the Calendar" : ""}{meet && email ? " and they get the invite by email" : ""}.
              {meet && !p.hasMeetingDefaults ? " Set your meeting link under Calendar › Meeting defaults so it's in the invite." : ""}
            </span>
          </div>
        )}

        <label className="flex flex-col gap-1 text-[13px] font-medium">Notes
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Who you spoke to, what they use now, anything to remember" />
        </label>

        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button disabled={!outcome || busy} onClick={save}>{saving ? "Saving…" : outcome === "interested" ? "Save & next call" : outcome === "callback" ? "Schedule & next call" : "Save & next call"}</Button>
          <Button variant="secondary" disabled={busy} onClick={onSkip}>Skip for now</Button>
          <Button variant="ghost" disabled={busy} onClick={onStop}>Stop calling</Button>
          {!outcome && <span className="text-xs text-slate">Pick how it went first.</span>}
        </div>
      </section>

    </>
  );
}
