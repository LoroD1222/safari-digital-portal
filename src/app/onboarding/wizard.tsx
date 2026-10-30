"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import {
  AD_GOALS, MARKETS, OFFERS, PAGES, WEB_GOALS,
  canFinish, isDriveLink, isTaskDone, tasksFor,
  type Answers, type Task, type TaskKey,
} from "@/lib/onboarding";
import { Alert, Button, Input, Textarea, buttonClass } from "@/components/ui";
import { VideoEmbed } from "@/components/video-embed";
import { saveOnboarding, submitOnboarding } from "./actions";

type Props = {
  clientId: string;
  companyName: string;
  contactName: string | null;
  services: { marketing: boolean; website: boolean };
  initialAnswers: Answers;
  initialView: View;
  submitted: boolean;
  metaConfirmed: boolean;
  supportWhatsapp: string | null;
  metaBusinessId: string | null;
  metaAdEmails: string[];
  driveShareEmail: string | null;
  metaAccessVideoUrl: string | null;
  driveTutorialVideoUrl: string | null;
  note?: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";
type View = "hub" | "done" | TaskKey;

// ───────────────────────── Small form pieces ─────────────────────────

function Label({ htmlFor, children, optional }: { htmlFor?: string; children: ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="font-medium">
      {children}
      {optional && <span className="font-normal text-slate"> · optional</span>}
    </label>
  );
}

function TextField({ id, label, value, onChange, optional, placeholder, type = "text", hint }: {
  id: string; label: string; value?: string; onChange: (v: string) => void; optional?: boolean; placeholder?: string; type?: string; hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} optional={optional}>{label}</Label>
      <Input id={id} type={type} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="text-xs text-slate">{hint}</span>}
    </div>
  );
}

function AreaField({ id, label, value, onChange, optional, placeholder }: {
  id: string; label: string; value?: string; onChange: (v: string) => void; optional?: boolean; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} optional={optional}>{label}</Label>
      <Textarea id={id} rows={3} value={value ?? ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

const chipCls = (on: boolean) =>
  "inline-flex h-9 cursor-pointer items-center gap-2 rounded-control border px-3 font-medium " +
  (on ? "border-brand bg-[#F1FAF6]" : "border-field bg-white hover:bg-[#F4F5F2]");

function Chips({ legend, options, value = [], onChange, addLabel = "Add your own", addPlaceholder = "Type and press Enter" }: {
  legend: string; options: string[]; value?: string[]; onChange: (v: string[]) => void; addLabel?: string; addPlaceholder?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  // Anything the client typed themselves shows as an extra chip after the presets.
  const custom = value.filter((v) => !options.includes(v));
  const all = [...options, ...custom];

  function add() {
    const v = draft.trim().replace(/\s+/g, " ").slice(0, 60);
    if (v) {
      const existing = all.find((o) => o.toLowerCase() === v.toLowerCase());
      if (existing) { if (!value.includes(existing)) onChange([...value, existing]); }
      else onChange([...value, v]);
    }
    setDraft("");
    setAdding(false);
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-2 font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {all.map((o) => {
          const on = value.includes(o);
          return (
            <label key={o} className={chipCls(on)}>
              <input type="checkbox" className="accent-brand" checked={on}
                onChange={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} />
              {o}
            </label>
          );
        })}
        {adding ? (
          <span className="inline-flex h-9 items-center gap-1 rounded-control border border-brand bg-white pl-3 pr-1">
            <input
              autoFocus
              value={draft}
              aria-label={`${addLabel}: ${legend}`}
              placeholder={addPlaceholder}
              maxLength={60}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); add(); }
                if (e.key === "Escape") { setDraft(""); setAdding(false); }
              }}
              onBlur={add}
              className="w-44 bg-transparent text-sm outline-none placeholder:text-[#8A8FA3]"
            />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={add} className="h-7 rounded-badge px-2 text-[13px] font-semibold text-brand hover:bg-[#F1FAF6]">Add</button>
          </span>
        ) : (
          <button type="button" onClick={() => setAdding(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-control border border-dashed border-[#B7BCC8] px-3 font-medium text-brand hover:border-brand hover:bg-[#F1FAF6]">
            <span aria-hidden className="text-base leading-none">+</span>{addLabel}
          </button>
        )}
      </div>
    </fieldset>
  );
}

function Radios<T extends string>({ legend, name, options, value, onChange }: {
  legend: string; name: string; options: [T, string][]; value?: T; onChange: (v: T) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-2 font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <label key={v} className={chipCls(value === v)}>
            <input type="radio" name={name} className="accent-brand" checked={value === v} onChange={() => onChange(v)} />
            {l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Check({ checked, onChange, children }: { checked?: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className={"flex min-h-12 cursor-pointer items-center gap-2.5 rounded-control border px-3.5 font-medium " + (checked ? "border-brand bg-[#F1FAF6]" : "border-field bg-white")}>
      <input type="checkbox" className="size-4 accent-brand" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}


function Section({ title, children, first }: { title: string; children: ReactNode; first?: boolean }) {
  return (
    <section className={"flex flex-col gap-3 " + (first ? "" : "border-t border-line-soft pt-5")}>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Timeline({ stage, steps }: { stage: number; steps: [string, string][] }) {
  return (
    <ol>
      {steps.map(([label, desc], i) => {
        const done = i < stage, here = i === stage, last = i === steps.length - 1;
        return (
          <li key={label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span aria-hidden className={"mt-1 size-3 flex-none rounded-full " + (done ? "bg-brand" : here ? "bg-white shadow-[inset_0_0_0_3px_#1A6647]" : "bg-field")} />
              <span className={"min-h-3.5 w-[1.5px] flex-1 " + (last ? "bg-transparent" : done ? "bg-brand" : "bg-line")} />
            </div>
            <div className="pb-3.5">
              <div className={"text-[13px] " + (here ? "font-semibold" : "font-medium")}>{label}{here && <span className="sr-only"> (current)</span>}</div>
              <div className="text-xs text-slate">{desc}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ───────────────────────── Checklist ─────────────────────────

export function Wizard(p: Props) {
  const tasks = useMemo(() => tasksFor(p.services), [p.services]);
  const keys = tasks.map((t) => t.key);
  const [view, setView] = useState<View>(p.initialView);
  const [a, setA] = useState<Answers>(p.initialAnswers);
  const [submitted, setSubmitted] = useState(p.submitted);
  const [save, setSave] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const dirty = useRef(false);
  const mainRef = useRef<HTMLElement>(null);

  // Save a moment after the last change.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(async () => {
      setSave("saving");
      const res = await saveOnboarding(a).catch(() => ({ ok: false }));
      setSave(res.ok ? "saved" : "error");
    }, 700);
    return () => clearTimeout(t);
  }, [a]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  function update<K extends Exclude<keyof Answers, "done">>(section: K, patch: Partial<NonNullable<Answers[K]>>) {
    dirty.current = true;
    setNudge(false);
    setA((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  }

  function go(next: View) {
    setView(next);
    setNudge(false);
    setError(null);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => mainRef.current?.querySelector("h1")?.focus());
  }

  const done = (k: TaskKey) => isTaskDone(k, a);
  const left = tasks.filter((t) => !done(t.key));
  const doneCount = tasks.length - left.length;
  const minutesLeft = left.reduce((n, t) => n + t.minutes, 0);
  const allDone = left.length === 0;
  const task = tasks.find((t) => t.key === view);
  const nextOpen = (k: TaskKey) => {
    const i = keys.indexOf(k);
    for (let j = 1; j < keys.length; j++) { const n = keys[(i + j) % keys.length]; if (!done(n)) return n; }
    return null;
  };

  function statusOf(t: Task): { label: string; tone: string } {
    if (!done(t.key)) return { label: "To do", tone: "bg-[#F4F5F2] text-slate" };
    const confirmed = t.key === "meta" ? p.metaConfirmed : t.key === "photos" ? false : true;
    return confirmed || t.group === "ask"
      ? { label: "Done", tone: "bg-[#F1FAF6] text-brand" }
      : { label: "We're checking", tone: "bg-[#FFF7E8] text-[#8A5A12]" };
  }

  function saveTask() {
    if (!task) return;
    if (!canFinish(task.key, a)) { setNudge(true); return; }
    dirty.current = true;
    const nextA = { ...a, done: { ...a.done, [task.key]: true } };
    setA(nextA);
    setToast(`${task.title} saved`);
    const after = nextOpen(task.key);
    // isTaskDone on the old answers still counts this task as open, so skip it explicitly.
    go(after && after !== task.key ? after : submitted ? "done" : "hub");
  }

  function submit() {
    setError(null);
    startSubmit(async () => {
      const res = await submitOnboarding(a);
      if (res.ok) { setSave("saved"); setSubmitted(true); go("done"); }
      else setError(res.error ?? "Something went wrong.");
    });
  }

  const hasMk = keys.includes("meta"), hasWeb = keys.includes("website");
  const serviceWords = hasMk && hasWeb ? "marketing and website" : hasMk ? "marketing" : "website";
  const firstName = (a.business?.contact_name || p.contactName || "").trim().split(/\s+/)[0];
  const wa = p.supportWhatsapp?.replace(/\D/g, "") || null;
  const timeline: [string, string][] = [
    ["You finish setup", "The tasks on this page"],
    ["We check everything", "Access, files and answers · 1–2 working days"],
    ["Your plan is ready", hasMk ? "First month of posts and ads to approve" : "Website structure to approve"],
    ["We go live", hasMk && hasWeb ? "Posts, ads and website design start" : hasMk ? "Posts and ads start" : "Website design starts"],
  ];
  const b = a.business ?? {}, m = a.marketing ?? {}, w = a.website ?? {}, f = a.files ?? {};
  const driveBad = !!f.drive_link?.trim() && !isDriveLink(f.drive_link);

  const header = (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-line-soft bg-white px-4 sm:px-6">
      <Image src="/safari-digital-logo.svg" alt="Safari Digital" width={140} height={22} priority className="h-[22px] w-auto" />
      <div className="flex items-center gap-3">
        {view !== "done" && (
          <>
            <span role="status" className="hidden items-center gap-1.5 text-[13px] text-slate sm:inline-flex">
              {save === "saving" ? "Saving…" : save === "error" ? <span className="text-danger-text">Not saved. Check your connection</span> : (<><CheckIcon className="text-brand" />Saved automatically</>)}
            </span>
            <Link href="/portal" className={buttonClass("secondary", "h-9")}>Finish later</Link>
          </>
        )}
        {view === "done" && <Link href="/portal" className={buttonClass("primary", "h-9")}>Go to Overview</Link>}
      </div>
    </header>
  );

  const toastEl = toast && (
    <div role="status" className="fixed bottom-6 left-1/2 z-50 max-w-[calc(100%-32px)] -translate-x-1/2 rounded-control bg-forest px-3.5 py-2.5 text-[13px] text-white shadow-[0_8px_24px_rgba(0,3,33,0.2)]">{toast}</div>
  );

  function row(t: Task, i: number) {
    const d = done(t.key), s = statusOf(t);
    return (
      <li key={t.key} className={i ? "border-t border-line-soft" : ""}>
        <div className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-[#FAFBF9] sm:px-[18px]">
          {d
            ? <span aria-hidden className="inline-flex size-[30px] flex-none items-center justify-center rounded-full bg-brand text-white"><CheckIcon className="size-3.5" /></span>
            : <span aria-hidden className="inline-flex size-[30px] flex-none items-center justify-center rounded-full border-[1.5px] border-field text-[13px] font-semibold text-slate">{keys.indexOf(t.key) + 1}</span>}
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{t.title}</div>
            <div className="text-[13px] text-slate">{t.desc}</div>
          </div>
          {!d && <span className="hidden flex-none whitespace-nowrap text-xs text-slate sm:inline">{t.minutes} min</span>}
          <span className={"hidden flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium sm:inline " + s.tone}>{s.label}</span>
          <Button variant={d ? "secondary" : "primary"} className="h-[34px] w-[84px] flex-none px-0" onClick={() => go(t.key)} aria-label={`${d ? "Edit" : "Start"} ${t.title}`}>
            {d ? "Edit" : "Start"}
          </Button>
        </div>
      </li>
    );
  }

  function group(id: string, title: string, intro: string, list: Task[]) {
    if (!list.length) return null;
    return (
      <section aria-labelledby={id} className="overflow-hidden rounded-card border border-line bg-white">
        <div className="border-b border-line-soft px-4 pb-3 pt-4 sm:px-[18px]">
          <h2 id={id} className="text-base font-semibold">{title}</h2>
          <p className="mt-0.5 text-[13px] text-slate">{intro}</p>
        </div>
        <ul>{list.map(row)}</ul>
      </section>
    );
  }

  // ── Sent ──
  if (view === "done") {
    return (
      <div className="flex min-h-screen flex-col bg-sidebar">
        {header}
        <main ref={mainRef} className="flex-1 px-4 pb-16 pt-14">
          <div className="mx-auto flex max-w-[640px] flex-col gap-5">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="inline-flex size-[52px] items-center justify-center rounded-full bg-[#E3F4EA] text-brand"><CheckIcon className="size-6" /></span>
              <h1 tabIndex={-1} className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] outline-none">Thanks{firstName ? `, ${firstName}` : ""}. We&apos;ve got it.</h1>
              <p className="text-body">We&apos;ll check everything within 2 working days and message you on WhatsApp if we need anything.</p>
            </div>
            {left.length > 0 && (
              <section aria-labelledby="left-h" className="overflow-hidden rounded-card border border-[#F2DDB0] bg-white">
                <div className="bg-[#FFF7E8] px-[18px] py-3.5">
                  <h2 id="left-h" className="text-sm font-semibold">Still to do</h2>
                  <p className="text-[13px] text-body">We can&apos;t start until these are done.</p>
                </div>
                <ul>
                  {left.map((t) => (
                    <li key={t.key} className="flex items-center gap-3 border-t border-[#F5EBD3] px-[18px] py-3">
                      <span className="flex-1 font-medium">{t.title}</span>
                      <Button variant="secondary" className="h-8 px-3" onClick={() => go(t.key)}>Finish now</Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section aria-labelledby="nx-h" className="rounded-card border border-line bg-white p-5">
              <h2 id="nx-h" className="mb-3.5 text-sm font-semibold">What happens next</h2>
              <Timeline stage={1} steps={timeline} />
            </section>
            <p className="text-center text-[13px] text-slate">
              Need to change something? <button type="button" onClick={() => go("hub")} className="font-medium text-brand hover:underline">Open your setup checklist</button>
            </p>
          </div>
        </main>
        {toastEl}
      </div>
    );
  }

  // ── One task ──
  if (task) {
    const after = nextOpen(task.key);
    return (
      <div className="flex min-h-screen flex-col bg-sidebar">
        {header}
        <main ref={mainRef} className="mx-auto w-full max-w-[760px] flex-1 px-4 pb-16 pt-7 sm:px-6">
          <button type="button" onClick={() => go("hub")} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand hover:underline">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>
            Setup checklist
          </button>
          <div className="mb-5 mt-3.5">
            <span className="text-[13px] text-slate">{task.group === "ask" ? "Tell us about your business" : "Give us access"} · about {task.minutes} min</span>
            <h1 tabIndex={-1} className="mb-1.5 mt-0.5 text-2xl font-semibold leading-tight tracking-[-0.02em] outline-none">{task.title}</h1>
            <p className="text-body">{task.why}</p>
          </div>

          <div className="flex flex-col gap-[22px] rounded-card border border-line bg-white p-5 sm:p-6">
            {task.key === "business" && (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-sidebar px-3 py-2.5 text-[13px]">
                  <span><span className="text-slate">Company</span> <strong className="font-semibold">{p.companyName}</strong></span>
                  <span className="text-slate">Wrong name? Tell us on WhatsApp.</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField id="ob-contact" label="Your name" placeholder="Main contact person" value={b.contact_name} onChange={(v) => update("business", { contact_name: v })} />
                  <TextField id="ob-wa" label="WhatsApp number" type="tel" placeholder="+255 7xx xxx xxx" value={b.whatsapp} onChange={(v) => update("business", { whatsapp: v })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <AreaField id="ob-about" label="About your company" placeholder="Who you are and what makes your safaris special. Rough notes are fine." value={b.about} onChange={(v) => update("business", { about: v })} />
                  <span className="text-xs text-slate">We use this for your bio, ads and the About page.</span>
                </div>
                <Chips legend="What do you offer?" addPlaceholder="e.g. Honeymoon safaris" options={OFFERS} value={b.offers} onChange={(v) => update("business", { offers: v })} />
                <Chips legend="Where do your guests come from?" addLabel="Add a country" addPlaceholder="e.g. Australia" options={MARKETS} value={b.markets} onChange={(v) => update("business", { markets: v })} />
                <Radios legend="Where should new guest inquiries go?" name="dest" value={b.inquiry_dest}
                  options={[["whatsapp", "WhatsApp"], ["email", "Email"], ["both", "Both"]]} onChange={(v) => update("business", { inquiry_dest: v })} />
                {b.inquiry_dest !== "whatsapp" && (
                  <div className="max-w-[360px]">
                    <TextField id="ob-inqemail" label="Inquiry email" type="email" placeholder="bookings@yourcompany.com" value={b.inquiry_email} onChange={(v) => update("business", { inquiry_email: v })} />
                  </div>
                )}
              </>
            )}

            {task.key === "ads" && (
              <>
                <div className="max-w-[280px]">
                  <TextField id="ob-budget" label="Monthly ad budget (USD)" placeholder="e.g. 600" value={m.budget} onChange={(v) => update("marketing", { budget: v.replace(/[^\d.,]/g, "") })} hint="Paid directly to Meta with your card, not to us. Not sure? We'll suggest one." />
                </div>
                <Chips legend="What should ads bring you?" options={AD_GOALS} value={m.ad_goals} onChange={(v) => update("marketing", { ad_goals: v })} />
                <AreaField id="ob-promo" label="Trips or offers to promote first" optional placeholder="e.g. 7-day Serengeti safari, green-season rates" value={m.promote} onChange={(v) => update("marketing", { promote: v })} />
              </>
            )}

            {task.key === "website" && (
              <>
                <TextField id="ob-site" label="Current website" optional placeholder="yourcompany.com" value={w.current_site} onChange={(v) => update("website", { current_site: v })} />
                <div className="flex flex-col gap-2.5">
                  <Radios legend="Do you have a domain name?" name="dom" value={w.domain_choice}
                    options={[["have", "Yes, I have one"], ["need", "No, I need one"], ["unsure", "Not sure"]]} onChange={(v) => update("website", { domain_choice: v })} />
                  {w.domain_choice === "have" && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TextField id="ob-dom" label="Domain" placeholder="yourcompany.co.tz" value={w.domain} onChange={(v) => update("website", { domain: v })} />
                        <TextField id="ob-reg" label="Registered with" placeholder="e.g. GoDaddy" value={w.registrar} onChange={(v) => update("website", { registrar: v })} />
                      </div>
                      <span className="text-xs text-slate">No passwords here. We&apos;ll send you simple steps to connect it when the site is ready.</span>
                    </>
                  )}
                  {w.domain_choice === "need" && (
                    <div className="max-w-[360px]">
                      <TextField id="ob-want" label="Domain you'd like" placeholder="e.g. yourcompany.com" value={w.wanted_domain} onChange={(v) => update("website", { wanted_domain: v })} hint="We'll check it's available before buying it for you." />
                    </div>
                  )}
                </div>
                <Chips legend="What should your website do best?" options={WEB_GOALS} value={w.goals} onChange={(v) => update("website", { goals: v })} />
                <Chips legend="Pages you need" addLabel="Add a page" addPlaceholder="e.g. Gallery" options={PAGES} value={w.pages} onChange={(v) => update("website", { pages: v })} />
                <AreaField id="ob-likes" label="Websites you like" optional placeholder="Paste links and tell us what you like about them" value={w.likes} onChange={(v) => update("website", { likes: v })} />
              </>
            )}

            {task.key === "meta" && (
              <>
                <Section first title="Step 1 · Which pages are yours?">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField id="ob-fb" label="Facebook page" placeholder="facebook.com/yourpage" value={m.facebook} onChange={(v) => update("marketing", { facebook: v })} />
                    <TextField id="ob-ig" label="Instagram" placeholder="@yourcompany" value={m.instagram} onChange={(v) => update("marketing", { instagram: v })} />
                  </div>
                  <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-[13px] font-medium">
                    <input type="checkbox" className="size-4 accent-brand" checked={!!m.no_instagram} onChange={(e) => update("marketing", { no_instagram: e.target.checked })} />
                    We don&apos;t have Instagram yet. Please set one up for us.
                  </label>
                </Section>
                <Section title="Step 2 · Add Safari Digital as a partner">
                  <VideoEmbed url={p.metaAccessVideoUrl} title="How to add Safari Digital as a partner" />
                  <ol className="list-decimal space-y-2 pl-5 text-body">
                    <li>Open <strong className="font-semibold text-ink">Meta Business Suite</strong> and go to <strong className="font-semibold text-ink">Settings → Partners → Add partner</strong>.</li>
                    <li>
                      Paste Safari Digital&apos;s Business ID:{" "}
                      {p.metaBusinessId
                        ? <span className="ml-1 inline-flex items-center gap-2 rounded-badge border border-line bg-sidebar py-0.5 pl-2.5 pr-1 font-mono text-ink">{p.metaBusinessId}<CopyButton text={p.metaBusinessId} /></span>
                        : <strong className="font-semibold text-ink">we&apos;ll send it to you on WhatsApp</strong>}
                    </li>
                    <li>Tick your <strong className="font-semibold text-ink">Facebook page, Instagram account and ad account</strong>, and give full control.</li>
                  </ol>
                  <div className="flex flex-wrap items-center gap-4">
                    <a href="https://business.facebook.com/settings/partners" target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "h-9")}>Open Meta Business Suite ↗</a>
                    <span className="text-[13px] text-slate">We never ask for your password.</span>
                  </div>
                </Section>
                {p.metaAdEmails.length > 0 && (
                  <Section title="Step 3 · Add our team to your ad account">
                    <ol className="list-decimal space-y-2 pl-5 text-body">
                      <li>In <strong className="font-semibold text-ink">Meta Business Suite</strong>, go to <strong className="font-semibold text-ink">Settings → People → Invite people</strong>.</li>
                      <li>
                        Add {p.metaAdEmails.length === 1 ? "this email" : "these emails"}:
                        <span className="mt-1.5 flex flex-wrap gap-2">
                          {p.metaAdEmails.map((e) => (
                            <span key={e} className="inline-flex items-center gap-2 rounded-badge border border-line bg-sidebar py-0.5 pl-2.5 pr-1 font-mono text-[13px] text-ink">{e}<CopyButton text={e} /></span>
                          ))}
                        </span>
                      </li>
                      <li>Give them access to your <strong className="font-semibold text-ink">ad account</strong> with <strong className="font-semibold text-ink">full control</strong> (Manage ad account), then send the invite.</li>
                    </ol>
                    <a href="https://business.facebook.com/settings/people" target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "h-9 self-start")}>Open People settings ↗</a>
                  </Section>
                )}
                <Section title={p.metaAdEmails.length > 0 ? "Step 4 · Confirm" : "Step 3 · Confirm"}>
                  <Check checked={m.invite_sent} onChange={(v) => update("marketing", { invite_sent: v })}>I&apos;ve sent the partner request to Safari Digital</Check>
                  {p.metaAdEmails.length > 0 && (
                    <Check checked={!!m.people_added} onChange={(v) => update("marketing", { people_added: v })}>I&apos;ve added the Safari Digital team to our ad account</Check>
                  )}
                  <span className="text-xs text-slate">
                    {p.metaConfirmed ? "Confirmed. We can see your pages." : "We'll accept it and confirm here, usually the same day."}
                  </span>
                </Section>
              </>
            )}

            {task.key === "photos" && (
              <>
                <div className="rounded-card bg-sidebar px-4 py-3.5">
                  <div className="mb-1.5 font-semibold">What to put in the folder</div>
                  <ul className="grid list-disc gap-x-5 gap-y-1 pl-[18px] text-[13px] text-body sm:grid-cols-2">
                    <li><strong className="font-medium text-ink">Logo</strong>, the best quality you have</li>
                    <li><strong className="font-medium text-ink">Safari photos</strong>, wildlife, vehicles, camps, team</li>
                    <li><strong className="font-medium text-ink">Videos</strong>, straight from your phone is fine</li>
                    <li><strong className="font-medium text-ink">Itineraries</strong> you already send guests</li>
                  </ul>
                </div>
                <VideoEmbed url={p.driveTutorialVideoUrl} title="How to share a Google Drive folder" />
                <ol className="list-decimal space-y-2 pl-5 text-body">
                  <li>Create a folder in Google Drive called <strong className="font-semibold text-ink">{p.companyName} · Safari Digital</strong>.</li>
                  <li>Click <strong className="font-semibold text-ink">Share</strong> and {p.driveShareEmail ? <>add <strong className="font-semibold text-ink">{p.driveShareEmail}</strong> as Editor</> : <>set it to &ldquo;Anyone with the link can view&rdquo;</>}.</li>
                  <li>Copy the folder link and paste it below.</li>
                </ol>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ob-drive">Folder link</Label>
                  <Input id="ob-drive" value={f.drive_link ?? ""} aria-invalid={driveBad} placeholder="https://drive.google.com/drive/folders/…" onChange={(e) => update("files", { drive_link: e.target.value })} />
                  {driveBad && <span className="text-xs text-danger-text">That doesn&apos;t look like a Google Drive folder link.</span>}
                  {isDriveLink(f.drive_link) && <span className="text-xs text-brand">Looks good. We&apos;ll check we can open it.</span>}
                </div>
                <Check checked={f.drive_shared} onChange={(v) => update("files", { drive_shared: v })}>I&apos;ve shared the folder with Safari Digital</Check>
                <div className="border-t border-line-soft pt-5">
                  <AreaField id="ob-reviews" label="Guest reviews" optional placeholder="Your TripAdvisor or Google reviews link, or paste a few reviews" value={f.reviews} onChange={(v) => update("files", { reviews: v })} />
                </div>
              </>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" onClick={() => go("hub")}>Back to checklist</Button>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {nudge && (
                <span role="alert" className="text-[13px] text-[#8A5A12]">
                  {task.key === "meta" ? "Tick the box once you've sent the request in Meta." : "Add your Drive folder link and tick that you've shared it."}
                </span>
              )}
              <Button onClick={saveTask}>{after && after !== task.key ? "Save and continue" : "Save"}</Button>
            </div>
          </div>
        </main>
        {toastEl}
      </div>
    );
  }

  // ── Checklist ──
  return (
    <div className="flex min-h-screen flex-col bg-sidebar">
      {header}
      <main ref={mainRef} className="mx-auto grid w-full max-w-[1080px] flex-1 items-start gap-8 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <span className="text-[13px] font-medium text-brand">Account setup</span>
            <h1 tabIndex={-1} className="mb-1.5 mt-1 text-[26px] font-semibold leading-tight tracking-[-0.01em] outline-none">
              Welcome{firstName ? `, ${firstName}` : ""}. Let&apos;s get {p.companyName} ready.
            </h1>
            <p className="max-w-[600px] text-body">Finish these tasks so we can start your {serviceWords}. Do them in any order. Everything saves as you go, so you can stop and come back anytime.</p>
          </div>

          <div className="flex flex-col gap-2 rounded-card border border-line bg-white px-[18px] py-4">
            <div className="flex justify-between gap-3 text-[13px]">
              <span className="font-semibold">{doneCount} of {tasks.length} tasks done</span>
              <span className="text-slate">{allDone ? "All done" : `About ${minutesLeft} min left`}</span>
            </div>
            <div role="progressbar" aria-label="Setup progress" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={tasks.length} className="h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.round((doneCount / tasks.length) * 100)}%` }} />
            </div>
          </div>

          {p.note && (
            <div role="note" className="flex items-start gap-3 rounded-card border border-[#F2DDB0] bg-[#FFF7E8] px-4 py-3.5">
              <span aria-hidden className="inline-flex size-[22px] flex-none items-center justify-center rounded-full bg-[#8A5A12] text-[13px] font-semibold text-white">!</span>
              <div className="flex-1">
                <div className="font-semibold">Safari Digital needs a little more from you</div>
                <p className="whitespace-pre-wrap text-[13px] text-body">{p.note}</p>
                <p className="mt-1 text-[13px] text-slate">Update the tasks below, then send again.</p>
              </div>
            </div>
          )}

          {group("g-ask", "1. Tell us about your business", "Short questions. Rough answers are fine, we'll ask if anything is unclear.", tasks.filter((t) => t.group === "ask"))}
          {group("g-access", "2. Give us access", `Done in Meta and Google Drive.${p.metaAccessVideoUrl || p.driveTutorialVideoUrl ? " Each task has a short video." : ""} We never ask for your passwords.`, tasks.filter((t) => t.group === "access"))}

          <div className="flex flex-col gap-3 rounded-card border border-line bg-white p-[18px] sm:flex-row sm:items-center sm:gap-4">
            <div className="flex-1">
              {allDone ? (
                <>
                  <div className="font-semibold">{submitted ? "Everything's up to date" : "Everything's ready"}</div>
                  <div className="text-[13px] text-slate">{submitted ? "Send it again if you changed anything important." : "Send it to Safari Digital and we'll start checking."}</div>
                </>
              ) : (
                <>
                  <div className="font-semibold">{left.length} {left.length === 1 ? "task" : "tasks"} left before you send</div>
                  <div className="text-[13px] text-slate">
                    Can&apos;t finish an access task today?{" "}
                    <button type="button" onClick={submit} disabled={submitting} className="font-medium text-brand hover:underline">Send what you have</button> and finish it later.
                  </div>
                </>
              )}
              {error && <div className="mt-2"><Alert>{error}</Alert></div>}
            </div>
            <Button onClick={submit} disabled={!allDone || submitting} className="flex-none">
              {submitting ? "Sending…" : submitted ? "Send update" : "Send to Safari Digital"}
            </Button>
          </div>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <section aria-labelledby="hw" className="rounded-card border border-line bg-white p-[18px]">
            <h2 id="hw" className="mb-3 text-sm font-semibold">What happens next</h2>
            <Timeline stage={submitted ? 1 : 0} steps={timeline} />
          </section>
          {wa && (
            <section aria-labelledby="hp" className="flex flex-col gap-2.5 rounded-card border border-line bg-white p-[18px]">
              <h2 id="hp" className="text-sm font-semibold">Stuck on something?</h2>
              <p className="text-[13px] text-slate">Message us and we&apos;ll walk you through it.</p>
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "h-9")}>WhatsApp Safari Digital</a>
            </section>
          )}
        </aside>
      </main>
      {toastEl}
    </div>
  );
}
