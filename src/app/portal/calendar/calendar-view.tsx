"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/icons";
import { CopyButton } from "@/components/copy-button";
import {
  APPT_STATUS, DURATIONS, addDays, dayLabel, eat, googleCalendarUrl, longWhen, overlaps, weekLabel, type Appointment,
} from "@/lib/appointments";
import { deleteAppointment, saveAppointment, saveMeetingDefaults, sendAppointmentInvite, setAppointmentStatus, type AppointmentInput } from "./actions";

export type Lead = { id: string; customer_name: string; email: string | null; phone: string | null; status: string; received_at: string };

const noop = () => () => {};
const START_H = 7, END_H = 21, HOUR_PX = 52;
const TONE: Record<Appointment["status"], string> = {
  scheduled: "border-l-forest bg-[#E3F4EA] text-[#14402E]",
  done: "border-l-slate bg-[#F1F2F4] text-body",
  no_show: "border-l-[#C2413B] bg-[#FBEAEA] text-[#7A2420]",
  canceled: "border-l-line bg-white text-slate line-through",
};

type Draft = AppointmentInput & { id?: string };

export function CalendarView({ monday, today, appointments, leads, defaults, openForLead }: {
  monday: string; today: string; appointments: Appointment[]; leads: Lead[]; defaults: { link: string; address: string }; openForLead: string | null;
}) {
  const router = useRouter();
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const week = appointments.filter((a) => eat(a.starts_at).date <= days[6]);
  const upcoming = appointments.filter((a) => a.status === "scheduled" && Date.parse(a.starts_at) + a.duration_min * 60_000 >= Date.parse(`${today}T00:00:00+03:00`)).slice(0, 8);
  const leadName = useMemo(() => Object.fromEntries(leads.map((l) => [l.id, l.customer_name])), [leads]);

  const blank = (date: string, time: string, lead?: Lead): Draft => ({
    title: lead ? `Meeting with ${lead.customer_name}` : "", date, time, duration: 30, kind: "online",
    meeting_link: defaults.link, location: defaults.address, notes: "", inquiry_id: lead?.id ?? null, invite: !!lead?.email,
  });
  // Arriving from a lead ("Book a meeting"): open a new meeting for them.
  const [draft, setDraft] = useState<Draft | null>(() => {
    const l = openForLead ? leads.find((x) => x.id === openForLead) : null;
    return l ? blank(today >= monday && today <= days[6] ? today : monday, "10:00", l) : null;
  });
  const [open, setOpen] = useState<Appointment | null>(null);
  const [showDefaults, setShowDefaults] = useState(false);
  const [toast, setToast] = useState<string | null>(null);


  const nav = (w: string) => `/portal/calendar?w=${w}`;
  // The red "now" line: only in the browser, so the server and browser render the same page.
  const nowMin = useSyncExternalStore(noop, () => eat(new Date().toISOString()).minutes, () => null);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">Calendar</h1>
          <p className="text-body">Meetings with leads. Times are Tanzania time (EAT).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="h-9" onClick={() => setShowDefaults((v) => !v)}>Meeting defaults</Button>
          <Button className="h-9" onClick={() => setDraft(blank(today >= monday && today <= days[6] ? today : monday, "10:00"))}><Icon name="plus" size={16} />New meeting</Button>
        </div>
      </div>

      {showDefaults && <Defaults defaults={defaults} onDone={(m) => { setShowDefaults(false); setToast(m); router.refresh(); }} />}
      {toast && <p role="status" className="rounded-control bg-[#EEF6F1] px-3 py-2 text-[13px] text-forest">{toast}</p>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section aria-label={`Week of ${weekLabel(monday)}`} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Link href={nav(addDays(monday, -7))} scroll={false} aria-label="Previous week" className="flex size-9 items-center justify-center rounded-control border border-field bg-white hover:bg-[#F4F5F2]"><Icon name="chevronLeft" size={16} /></Link>
            <Link href={nav(addDays(monday, 7))} scroll={false} aria-label="Next week" className="flex size-9 items-center justify-center rounded-control border border-field bg-white hover:bg-[#F4F5F2]"><Icon name="chevronRight" size={16} /></Link>
            <h2 className="ml-1 text-[16px] font-semibold">{weekLabel(monday)}</h2>
            {!(today >= monday && today <= days[6]) && <Link href={nav(today)} scroll={false} className="ml-2 text-[13px] font-medium text-brand">This week</Link>}
          </div>

          {/* Week grid (tablet and up) */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-white md:block">
            <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-b border-line bg-sidebar">
              <span />
              {days.map((d) => (
                <div key={d} className={`px-2 py-2 text-xs font-medium ${d === today ? "text-forest" : "text-slate"}`}>
                  {dayLabel(d).split(" ")[0]} <span className={d === today ? "rounded-full bg-forest px-1.5 py-0.5 text-white" : "text-ink"}>{dayLabel(d).split(" ")[1]}</span>
                </div>
              ))}
            </div>
            <div className="relative grid grid-cols-[48px_repeat(7,minmax(0,1fr))]" style={{ height: (END_H - START_H) * HOUR_PX }}>
              <div className="relative">
                {Array.from({ length: END_H - START_H }, (_, i) => (
                  <span key={i} className="absolute right-1.5 -translate-y-1/2 text-[11px] tabular-nums text-slate" style={{ top: i * HOUR_PX }}>{i ? `${String(START_H + i).padStart(2, "0")}:00` : ""}</span>
                ))}
              </div>
              {days.map((d) => (
                <div key={d} className={`relative border-l border-line-soft ${d === today ? "bg-[#FAFCFA]" : ""}`}>
                  {Array.from({ length: END_H - START_H }, (_, i) => (
                    <button key={i} type="button" aria-label={`New meeting ${dayLabel(d)} ${START_H + i}:00`}
                      onClick={() => setDraft(blank(d, `${String(START_H + i).padStart(2, "0")}:00`))}
                      className="absolute inset-x-0 border-t border-line-soft hover:bg-[#F4F8F5]" style={{ top: i * HOUR_PX, height: HOUR_PX }} />
                  ))}
                  {d === today && nowMin !== null && nowMin >= START_H * 60 && nowMin < END_H * 60 && (
                    <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-[#C2413B]" style={{ top: ((nowMin - START_H * 60) / 60) * HOUR_PX }} />
                  )}
                  {week.filter((a) => eat(a.starts_at).date === d).map((a) => {
                    const m = Math.max(START_H * 60, Math.min(END_H * 60 - 15, eat(a.starts_at).minutes));
                    const h = Math.max(22, (a.duration_min / 60) * HOUR_PX - 2);
                    return (
                      <button key={a.id} type="button" onClick={() => setOpen(a)}
                        className={`absolute inset-x-1 z-20 flex flex-col overflow-hidden rounded-[6px] border-l-[3px] px-1.5 py-1 text-left text-[11px] leading-tight shadow-[0_1px_2px_rgba(0,3,33,0.08)] ${TONE[a.status]}`}
                        style={{ top: ((m - START_H * 60) / 60) * HOUR_PX + 1, height: h }}>
                        <span className="truncate font-semibold">{eat(a.starts_at).time} {a.title}</span>
                        {h > 34 && <span className="truncate opacity-80">{a.kind === "online" ? "Online" : a.location ?? "In person"}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Day list (phones) */}
          <div className="flex flex-col gap-3 md:hidden">
            {days.map((d) => {
              const list = week.filter((a) => eat(a.starts_at).date === d);
              return (
                <div key={d} className="flex flex-col gap-1.5">
                  <h3 className={`flex items-center justify-between text-[13px] font-semibold ${d === today ? "text-brand" : ""}`}>
                    {dayLabel(d)}{d === today ? " · Today" : ""}
                    <button type="button" onClick={() => setDraft(blank(d, "10:00"))} className="text-[13px] font-medium text-brand">+ Add</button>
                  </h3>
                  {list.length ? (
                    <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-white">
                      {list.map((a) => (
                        <li key={a.id} className="border-b border-line-soft last:border-b-0">
                          <button type="button" onClick={() => setOpen(a)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
                            <span className="w-11 text-[13px] font-semibold tabular-nums">{eat(a.starts_at).time}</span>
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span className={`truncate text-[14px] font-medium ${a.status === "canceled" ? "line-through text-slate" : ""}`}>{a.title}</span>
                              <span className="text-xs text-slate">{a.duration_min} min · {a.kind === "online" ? "Online" : a.location ?? "In person"} · {APPT_STATUS[a.status]}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-xs text-slate">Nothing booked.</p>}
                </div>
              );
            })}
          </div>
        </section>

        <aside aria-labelledby="up-h" className="flex flex-col gap-2 rounded-card border border-line px-4 py-4">
          <h2 id="up-h" className="text-[15px] font-semibold">Coming up</h2>
          {upcoming.length === 0 ? <p className="text-[13px] text-slate">No meetings in the next two weeks.</p> : (
            <ul className="flex flex-col">
              {upcoming.map((a) => (
                <li key={a.id} className="border-t border-line-soft first:border-t-0">
                  <button type="button" onClick={() => setOpen(a)} className="flex w-full flex-col gap-0.5 py-2 text-left">
                    <span className="text-[13px] font-semibold">{dayLabel(eat(a.starts_at).date)} · {eat(a.starts_at).time}</span>
                    <span className="truncate text-[13px] text-body">{a.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      {draft && (
        <Editor draft={draft} leads={leads} appointments={appointments} defaults={defaults}
          onClose={() => setDraft(null)} onSaved={(m) => { setDraft(null); setOpen(null); setToast(m); router.refresh(); }} />
      )}
      {open && !draft && (
        <Details a={open} leadName={open.inquiry_id ? leadName[open.inquiry_id] ?? null : null} leadEmail={open.inquiry_id ? leads.find((l) => l.id === open.inquiry_id)?.email ?? null : null}
          onClose={() => setOpen(null)}
          onEdit={() => { const s = eat(open.starts_at); setDraft({ id: open.id, title: open.title, date: s.date, time: s.time, duration: open.duration_min, kind: open.kind, meeting_link: open.meeting_link ?? "", location: open.location ?? "", notes: open.notes ?? "", inquiry_id: open.inquiry_id, invite: false }); }}
          onDone={(m) => { setOpen(null); if (m) setToast(m); router.refresh(); }} />
      )}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    ref.current?.querySelector<HTMLElement>("input, select, button")?.focus();
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(0,3,33,0.35)] p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-y-auto rounded-t-card bg-white p-5 shadow-xl sm:rounded-card">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-8 items-center justify-center rounded-control text-slate hover:bg-[#F4F5F2]"><Icon name="close" size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Editor({ draft, leads, appointments, defaults, onClose, onSaved }: {
  draft: Draft; leads: Lead[]; appointments: Appointment[]; defaults: { link: string; address: string }; onClose: () => void; onSaved: (m: string) => void;
}) {
  const [pending, start] = useTransition();
  const [d, setD] = useState<Draft>(draft);
  const [error, setError] = useState<string | null>(null);
  const lead = leads.find((l) => l.id === d.inquiry_id) ?? null;
  const clash = appointments.find((a) => a.id !== d.id && a.status === "scheduled" && /^\d{4}-\d{2}-\d{2}$/.test(d.date) && /^\d{2}:\d{2}$/.test(d.time)
    && overlaps(a, { starts_at: new Date(Date.parse(`${d.date}T${d.time}:00+03:00`)).toISOString(), duration_min: d.duration }));
  const save = () => start(async () => {
    setError(null);
    const r = await saveAppointment(d, d.id);
    if (r.ok) onSaved(r.message ?? "Saved."); else setError(r.error);
  });
  return (
    <Modal title={d.id ? "Edit meeting" : "New meeting"} onClose={onClose}>
      <div className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium"><span>Lead <span className="font-normal text-slate">(optional)</span></span>
          <Select value={d.inquiry_id ?? ""} onChange={(e) => {
            const l = leads.find((x) => x.id === e.target.value) ?? null;
            setD({ ...d, inquiry_id: l?.id ?? null, title: !d.title || d.title.startsWith("Meeting with ") ? (l ? `Meeting with ${l.customer_name}` : "") : d.title, invite: !!l?.email && (d.id ? d.invite : true) });
          }}>
            <option value="">No lead: a general meeting</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.customer_name}{l.email ? ` · ${l.email}` : l.phone ? ` · ${l.phone}` : ""}</option>)}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">Title
          <Input value={d.title} maxLength={160} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="Intro call with Golden Trips" />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
          <label className="col-span-2 flex flex-col gap-1.5 text-[13px] font-medium sm:col-span-1">Date
            <Input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">Time (EAT)
            <Input type="time" step={900} value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">Length
            <Select value={d.duration} onChange={(e) => setD({ ...d, duration: Number(e.target.value) })}>
              {DURATIONS.map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
            </Select>
          </label>
        </div>
        {clash && <p className="rounded-control bg-[#FDF3E1] px-3 py-2 text-[13px] text-[#8A5A12]">Clashes with “{clash.title}” at {eat(clash.starts_at).time}.</p>}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] font-medium">Where</legend>
          <div className="flex gap-2">
            {([["online", "Online (Meet / Zoom)"], ["in_person", "In person"]] as const).map(([k, l]) => (
              <label key={k} className={`flex h-9 cursor-pointer items-center gap-2 rounded-control border px-3 text-[13px] ${d.kind === k ? "border-forest bg-[#E3F4EA] font-medium" : "border-field"}`}>
                <input type="radio" name="kind" className="sr-only" checked={d.kind === k} onChange={() => setD({ ...d, kind: k })} />{l}
              </label>
            ))}
          </div>
          {d.kind === "online"
            ? <Input aria-label="Meeting link" value={d.meeting_link ?? ""} onChange={(e) => setD({ ...d, meeting_link: e.target.value })} placeholder={defaults.link || "https://meet.google.com/…"} />
            : <Input aria-label="Address" value={d.location ?? ""} onChange={(e) => setD({ ...d, location: e.target.value })} placeholder={defaults.address || "Office address"} />}
        </fieldset>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium"><span>Notes <span className="font-normal text-slate">(only for us)</span></span>
          <Textarea rows={2} value={d.notes ?? ""} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="What to prepare, who's joining…" />
        </label>
        <label className={`flex items-center gap-2.5 text-[13px] ${lead?.email ? "text-body" : "text-slate"}`}>
          <input type="checkbox" className="size-4 accent-[#1A6647]" disabled={!lead?.email} checked={!!d.invite && !!lead?.email} onChange={(e) => setD({ ...d, invite: e.target.checked })} />
          {lead?.email ? <>Email the meeting details to {lead.email}</> : "Pick a lead with an email to send them the meeting details"}
        </label>
        {!d.id && lead && ["new", "contacted", "no_answer", "no_show"].includes(lead.status) && <p className="text-xs text-slate">{lead.customer_name} moves to Meeting booked on the Pipeline.</p>}
        {error && <p role="alert" className="text-[13px] text-danger-text">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button className="h-10" disabled={pending} onClick={save}>{pending ? "Saving…" : d.id ? "Save" : "Book meeting"}</Button>
          <Button variant="secondary" className="h-10" disabled={pending} onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}

function Details({ a, leadName, leadEmail, onClose, onEdit, onDone }: {
  a: Appointment; leadName: string | null; leadEmail: string | null; onClose: () => void; onEdit: () => void; onDone: (m?: string) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (f: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    setError(null);
    const r = await f();
    if (r.ok) onDone(r.message); else setError(r.error ?? "Didn't work.");
  });
  return (
    <Modal title={a.title} onClose={onClose}>
      <div className="flex flex-col gap-3 text-[14px]">
        <p className="text-body">{longWhen(a.starts_at, a.duration_min)}</p>
        <p className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-sidebar px-2.5 py-0.5 text-xs font-medium">{APPT_STATUS[a.status]}</span>
          {a.invite_sent_at && <span className="text-xs text-slate">Invite emailed</span>}
        </p>
        {a.kind === "online"
          ? (a.meeting_link
            ? <span className="flex items-center gap-2"><a href={a.meeting_link} target="_blank" rel="noopener noreferrer" className="truncate text-brand">{a.meeting_link}</a><CopyButton text={a.meeting_link} /></span>
            : <span className="text-slate">Online · no link yet</span>)
          : <span>{a.location ?? "In person"}</span>}
        {leadName && a.inquiry_id && <span className="text-body">Lead: <Link href={`/portal/inquiries?open=${a.inquiry_id}`} className="font-medium text-brand">{leadName}</Link></span>}
        {a.notes && <p className="whitespace-pre-line rounded-control bg-sidebar px-3 py-2 text-[13px] text-body">{a.notes}</p>}
        {error && <p role="alert" className="text-[13px] text-danger-text">{error}</p>}
        <div className="flex flex-wrap gap-2 border-t border-line-soft pt-3">
          {a.status === "scheduled" && <>
            <Button className="h-9" disabled={pending} onClick={() => run(() => setAppointmentStatus(a.id, "done"))}>Mark done</Button>
            <Button variant="secondary" className="h-9" disabled={pending} onClick={() => run(() => setAppointmentStatus(a.id, "no_show"))}>No show</Button>
          </>}
          <Button variant="secondary" className="h-9" disabled={pending} onClick={onEdit}>Edit</Button>
          <a href={googleCalendarUrl(a)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-control border border-field px-3 text-[13px] font-medium hover:bg-[#F4F5F2]">Add to Google Calendar ↗</a>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {leadEmail && a.status === "scheduled" && <button type="button" disabled={pending} onClick={() => run(() => sendAppointmentInvite(a.id))} className="font-medium text-brand">{a.invite_sent_at ? "Email the details again" : `Email the details to ${leadEmail}`}</button>}
          {a.status === "scheduled" && <button type="button" disabled={pending} onClick={() => run(() => setAppointmentStatus(a.id, "canceled"))} className="font-medium text-slate hover:text-ink">Cancel meeting</button>}
          {a.status !== "scheduled" && <button type="button" disabled={pending} onClick={() => run(() => setAppointmentStatus(a.id, "scheduled"))} className="font-medium text-slate hover:text-ink">Back to scheduled</button>}
          <button type="button" disabled={pending} onClick={() => run(() => deleteAppointment(a.id))} className="font-medium text-danger-text">Delete</button>
        </div>
      </div>
    </Modal>
  );
}

function Defaults({ defaults, onDone }: { defaults: { link: string; address: string }; onDone: (m: string) => void }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState(defaults.link);
  const [address, setAddress] = useState(defaults.address);
  const [error, setError] = useState<string | null>(null);
  return (
    <section aria-label="Meeting defaults" className="flex flex-col gap-3 rounded-card border border-line px-5 py-4">
      <p className="text-[13px] text-slate">Filled in on every new meeting. You can change them per meeting.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">Meeting link (Google Meet / Zoom)
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/abc-defg-hij" />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">Office address (in person)
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Njiro, Arusha" />
        </label>
      </div>
      {error && <p className="text-[13px] text-danger-text">{error}</p>}
      <Button className="h-9 self-start" disabled={pending} onClick={() => start(async () => { const r = await saveMeetingDefaults(link, address); if (r.ok) onDone("Meeting defaults saved."); else setError(r.error); })}>Save defaults</Button>
    </section>
  );
}
