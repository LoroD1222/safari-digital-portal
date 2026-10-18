"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  AD_GOALS, FILE_CATEGORIES, MARKETS, OFFERS, PAGES, WEB_GOALS,
  isDriveLink, missingItems, stepsFor,
  type Answers, type FileCategory, type StepKey, type StoredFile,
} from "@/lib/onboarding";
import { Alert, Button, Input, Textarea, buttonClass } from "@/components/ui";
import { removeFile, saveOnboarding, submitOnboarding } from "./actions";

type Props = {
  clientId: string;
  companyName: string;
  services: { marketing: boolean; website: boolean };
  initialAnswers: Answers;
  initialFiles: StoredFile[];
  initialStep: StepKey;
  metaBusinessId: string | null;
  driveShareEmail: string | null;
};

type SaveState = "idle" | "saving" | "saved" | "error";

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

function Chips({ legend, options, value = [], onChange }: { legend: string; options: string[]; value?: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="pb-2 font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <label key={o} className={chipCls(on)}>
              <input type="checkbox" className="accent-brand" checked={on}
                onChange={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} />
              {o}
            </label>
          );
        })}
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

function StepTitle({ title, intro }: { title: string; intro: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="text-slate">{intro}</p>
    </div>
  );
}

function CheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// ───────────────────────── Wizard ─────────────────────────

export function Wizard(p: Props) {
  const steps = useMemo(() => stepsFor(p.services), [p.services]);
  const order: StepKey[] = ["welcome", ...steps.map((s) => s.key), "done"];
  const [step, setStep] = useState<StepKey>(p.initialStep);
  const [visited, setVisited] = useState<Set<StepKey>>(() => new Set(p.initialStep === "done" ? order : []));
  const [a, setA] = useState<Answers>(p.initialAnswers);
  const [files, setFiles] = useState<StoredFile[]>(p.initialFiles);
  const [save, setSave] = useState<SaveState>("idle");
  const [uploading, setUploading] = useState<FileCategory | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const dirty = useRef(false);
  const mainRef = useRef<HTMLDivElement>(null);

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

  function update<K extends keyof Answers>(section: K, patch: Partial<NonNullable<Answers[K]>>) {
    dirty.current = true;
    setA((prev) => ({ ...prev, [section]: { ...prev[section], ...patch } }));
  }

  function go(next: StepKey) {
    setVisited((v) => new Set(v).add(step));
    setStep(next);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => mainRef.current?.querySelector("h1")?.focus());
  }
  const idx = order.indexOf(step);
  const next = () => go(order[Math.min(idx + 1, order.length - 1)]);
  const back = () => go(order[Math.max(idx - 1, 0)]);

  async function upload(category: FileCategory, list: FileList | null) {
    if (!list?.length) return;
    setUploadError(null);
    setUploading(category);
    const supabase = createClient();
    const added: StoredFile[] = [];
    const stamp = new Date().getTime();
    for (const [n, file] of Array.from(list).entries()) {
      if (file.size > 50 * 1024 * 1024) { setUploadError(`${file.name} is over 50 MB. Share big videos through Google Drive instead.`); continue; }
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
      const path = `${p.clientId}/onboarding/${category}/${stamp + n}-${safe}`;
      const { error } = await supabase.storage.from("client-files").upload(path, file, { contentType: file.type || undefined });
      if (error) setUploadError(`${file.name} didn't upload. Please try again.`);
      else added.push({ path, name: safe, category });
    }
    setFiles((f) => [...f, ...added]);
    setUploading(null);
  }

  async function remove(f: StoredFile) {
    const res = await removeFile(f.path);
    if (res.ok) setFiles((list) => list.filter((x) => x.path !== f.path));
  }

  function submit() {
    setSubmitError(null);
    startSubmit(async () => {
      const res = await submitOnboarding(a);
      if (res.ok) { setSave("saved"); go("done"); }
      else setSubmitError(res.error ?? "Something went wrong.");
    });
  }

  const formSteps = steps.filter((s) => s.key !== "review");
  const doneCount = formSteps.filter((s) => visited.has(s.key) && s.key !== step).length;
  const missing = missingItems(a, files, steps.some((s) => s.key === "marketing"));
  const b = a.business ?? {}, m = a.marketing ?? {}, w = a.website ?? {}, f = a.files ?? {};
  const inForm = step !== "welcome" && step !== "done";
  const driveBad = !!f.drive_link?.trim() && !isDriveLink(f.drive_link);

  const header = (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-line-soft px-4 sm:px-6">
      <Image src="/safari-digital-logo.svg" alt="Safari Digital" width={140} height={22} priority className="h-[22px] w-auto" />
      <div className="flex items-center gap-3">
        {inForm && (
          <span role="status" className="hidden items-center gap-1.5 text-[13px] text-slate sm:inline-flex">
            {save === "saving" ? "Saving…" : save === "error" ? <span className="text-danger-text">Not saved. Check your connection</span> : (<><CheckIcon className="text-brand" />Saves as you go</>)}
          </span>
        )}
        {step !== "done" && <Link href="/portal" className={buttonClass("secondary", "h-9")}>Finish later</Link>}
      </div>
    </header>
  );

  // ── Welcome ──
  if (step === "welcome") {
    return (
      <div className="flex min-h-screen flex-col">
        {header}
        <main ref={mainRef} className="flex-1 px-4 pb-16 pt-14">
          <div className="mx-auto flex max-w-[600px] flex-col gap-7">
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-brand">Welcome to Safari Digital</span>
              <h1 tabIndex={-1} className="text-[28px] font-semibold leading-tight tracking-[-0.02em] outline-none">Let&apos;s get {p.companyName} set up</h1>
              <p className="text-[15px] text-slate">A few short steps so we can get started. It takes about 15 minutes, and everything saves as you go, so you can stop and come back anytime.</p>
            </div>
            <ol className="overflow-hidden rounded-card border border-line">
              {steps.map((s, i) => (
                <li key={s.key} className={"flex items-start gap-3.5 px-4 py-3.5 " + (i ? "border-t border-line-soft" : "")}>
                  <span className="inline-flex size-6 flex-none items-center justify-center rounded-full bg-[#F1F2F4] text-xs font-semibold">{i + 1}</span>
                  <span className="flex flex-col"><span className="font-medium">{s.label}</span><span className="text-[13px] text-slate">{s.desc}</span></span>
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-2 rounded-card bg-sidebar px-4 py-3.5">
              <span className="font-semibold">Good to have nearby</span>
              <ul className="list-disc space-y-1 pl-5 text-body">
                <li>Your logo and a few favourite safari photos (or a Google Drive folder)</li>
                {steps.some((s) => s.key === "marketing") && <li>Your Facebook login, to give us access in Meta Business Suite</li>}
                <li>Itineraries you already send to guests</li>
              </ul>
            </div>
            <Button className="h-11 self-start px-6 text-[15px]" onClick={next}>Get started</Button>
          </div>
        </main>
      </div>
    );
  }

  // ── Submitted ──
  if (step === "done") {
    const status = [
      ["Submitted", "You sent your information"],
      ["Being reviewed", "Safari Digital checks everything and confirms access"],
      ["Setup complete", "Your first posts, ads or website design start"],
    ];
    return (
      <div className="flex min-h-screen flex-col">
        {header}
        <main ref={mainRef} className="flex-1 px-4 pb-16 pt-14">
          <div className="mx-auto flex max-w-[600px] flex-col gap-6">
            <div className="flex flex-col items-start gap-3">
              <span className="inline-flex size-11 items-center justify-center rounded-full bg-[#E3F4EA] text-brand"><CheckIcon className="size-5" /></span>
              <h1 tabIndex={-1} className="text-2xl font-semibold tracking-[-0.02em] outline-none">Thanks! We&apos;ve received your information</h1>
              <p className="text-slate">We&apos;ll review your setup within 2 working days and get in touch if we need anything else. You can still add files or change answers.</p>
            </div>
            <section aria-labelledby="nx-h" className="flex flex-col gap-2.5">
              <h2 id="nx-h" className="text-[15px] font-semibold">What happens next</h2>
              <ol>
                {status.map(([label, desc], i) => (
                  <li key={label} className="flex items-center gap-3 border-t border-line-soft py-2.5">
                    {i === 0 ? <span className="inline-flex size-5 flex-none items-center justify-center rounded-full bg-brand text-white"><CheckIcon className="size-[11px]" /></span>
                      : i === 1 ? <span className="inline-flex size-5 flex-none items-center justify-center rounded-full border-2 border-brand"><span className="size-2 rounded-full bg-brand" /></span>
                        : <span className="size-5 flex-none rounded-full border-[1.5px] border-[#C9CDD6]" />}
                    <span className="flex flex-col"><span className={i === 1 ? "font-semibold" : i > 1 ? "text-slate" : ""}>{label}</span><span className="text-xs text-slate">{desc}</span></span>
                  </li>
                ))}
              </ol>
            </section>
            {missing.length > 0 && (
              <div className="flex flex-col gap-2 rounded-card border border-[#F1D9A8] bg-[#FFFAF0] px-4 py-3.5">
                <span className="font-semibold">Still to do when you can</span>
                <ul className="flex flex-col gap-1.5">
                  {missing.map((x) => (
                    <li key={x.text} className="flex items-center justify-between gap-3 text-body">
                      {x.text}
                      <button type="button" onClick={() => go(x.step)} className="text-[13px] font-medium text-brand">Fix</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Link href="/portal" className={buttonClass("primary")}>Go to Overview</Link>
              <Button variant="secondary" onClick={() => go("files")}>Add more files</Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Form steps ──
  return (
    <div className="flex min-h-screen flex-col">
      {header}
      <div className="flex flex-1 flex-wrap">
        <nav aria-label="Onboarding steps" className="max-w-full flex-[1_1_240px] border-r border-line-soft bg-[#FAFAF8] px-4 py-8 md:max-w-[280px]">
          <div className="flex flex-col gap-2.5 px-2 pb-4">
            <span className="text-[13px] text-slate">{doneCount} of {formSteps.length} steps done</span>
            <div role="progressbar" aria-label="Onboarding progress" aria-valuenow={doneCount} aria-valuemin={0} aria-valuemax={formSteps.length} className="h-1.5 overflow-hidden rounded-full bg-line">
              <div className="h-full bg-brand transition-[width]" style={{ width: `${Math.round((doneCount / formSteps.length) * 100)}%` }} />
            </div>
          </div>
          <ol className="flex flex-col gap-0.5">
            {steps.map((s, i) => {
              const here = s.key === step;
              const done = visited.has(s.key) && !here;
              return (
                <li key={s.key}>
                  <button type="button" onClick={() => go(s.key)} aria-current={here ? "step" : undefined}
                    className={"flex min-h-11 w-full items-center gap-3 rounded-control px-2.5 py-1.5 text-left " + (here ? "bg-white font-semibold shadow-[0_0_0_1px_#E6E8EC,0_1px_2px_rgba(0,3,33,0.04)]" : "font-medium hover:bg-[#EDEFEB]")}>
                    {done
                      ? <span className="inline-flex size-[22px] flex-none items-center justify-center rounded-full bg-brand text-white"><CheckIcon className="size-[11px]" /></span>
                      : <span className={"inline-flex size-[22px] flex-none items-center justify-center rounded-full border-[1.5px] text-[11px] font-semibold " + (here ? "border-brand text-brand" : "border-[#8A8FA3] text-[#8A8FA3]")}>{i + 1}</span>}
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <main ref={mainRef} className="min-w-0 flex-[999_1_520px] px-4 pb-16 pt-10 sm:px-6">
          <div className="mx-auto flex max-w-[600px] flex-col gap-6">

            {step === "business" && (
              <div className="flex flex-col gap-5">
                <StepTitle title="Tell us about your business" intro="The basics we use everywhere: your posts, ads and website." />
                <div className="flex flex-col gap-1.5">
                  <span className="font-medium">Company</span>
                  <span className="flex h-10 items-center rounded-control bg-sidebar px-3">{p.companyName}</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField id="ob-contact" label="Your name" placeholder="Main contact person" value={b.contact_name} onChange={(v) => update("business", { contact_name: v })} />
                  <TextField id="ob-wa" label="WhatsApp number" type="tel" placeholder="+255" value={b.whatsapp} onChange={(v) => update("business", { whatsapp: v })} />
                </div>
                <AreaField id="ob-about" label="About your company" placeholder="Who you are and what makes your safaris special. Rough notes are fine." value={b.about} onChange={(v) => update("business", { about: v })} />
                <Chips legend="What do you offer?" options={OFFERS} value={b.offers} onChange={(v) => update("business", { offers: v })} />
                <Chips legend="Which countries do your guests come from?" options={MARKETS} value={b.markets} onChange={(v) => update("business", { markets: v })} />
                <Radios legend="Where should new inquiries go?" name="dest" value={b.inquiry_dest}
                  options={[["whatsapp", "WhatsApp"], ["email", "Email"], ["both", "Both"]]} onChange={(v) => update("business", { inquiry_dest: v })} />
                {b.inquiry_dest !== "whatsapp" && (
                  <TextField id="ob-inqemail" label="Inquiry email" type="email" placeholder="bookings@yourcompany.com" value={b.inquiry_email} onChange={(v) => update("business", { inquiry_email: v })} />
                )}
              </div>
            )}

            {step === "marketing" && (
              <div className="flex flex-col gap-6">
                <StepTitle title="Facebook & Instagram" intro="Your pages, access for Safari Digital, and what to focus on." />
                <section className="flex flex-col gap-3">
                  <h2 className="text-[15px] font-semibold">1. Your pages</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField id="ob-ig" label="Instagram account" placeholder="@yourcompany" value={m.instagram} onChange={(v) => update("marketing", { instagram: v })} />
                    <TextField id="ob-fb" label="Facebook page" placeholder="facebook.com/yourpage" value={m.facebook} onChange={(v) => update("marketing", { facebook: v })} />
                  </div>
                  <label className="flex min-h-10 cursor-pointer items-center gap-2.5 font-medium">
                    <input type="checkbox" className="size-4 accent-brand" checked={!!m.no_instagram} onChange={(e) => update("marketing", { no_instagram: e.target.checked })} />
                    We don&apos;t have an Instagram account yet. Please set one up for us.
                  </label>
                </section>
                <section className="flex flex-col gap-3 border-t border-line-soft pt-5">
                  <h2 className="text-[15px] font-semibold">2. Give Safari Digital access</h2>
                  <ol className="list-decimal space-y-1.5 pl-5">
                    <li>Open Meta Business Suite and go to <strong className="font-semibold">Settings → Partners</strong>.</li>
                    <li>Add a partner using Safari Digital&apos;s Business ID: <strong className="font-semibold">{p.metaBusinessId ?? "we'll send it to you on WhatsApp"}</strong></li>
                    <li>Give access to your Facebook page, Instagram account and ad account.</li>
                  </ol>
                  <div className="flex flex-wrap items-center gap-3">
                    <a href="https://business.facebook.com/" target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>Open Meta Business Suite ↗</a>
                    <span className="text-[13px] text-slate">We never ask for your password.</span>
                  </div>
                  <Check checked={m.invite_sent} onChange={(v) => update("marketing", { invite_sent: v })}>I&apos;ve sent the access invitation</Check>
                </section>
                <section className="flex flex-col gap-4 border-t border-line-soft pt-5">
                  <h2 className="text-[15px] font-semibold">3. Your advertising</h2>
                  <div className="max-w-[280px]">
                    <TextField id="ob-budget" label="Monthly ad budget (USD)" placeholder="e.g. 600" value={m.budget} onChange={(v) => update("marketing", { budget: v.replace(/[^\d.,]/g, "") })} hint="Paid directly to Meta, not to us." />
                  </div>
                  <Chips legend="What should ads achieve?" options={AD_GOALS} value={m.ad_goals} onChange={(v) => update("marketing", { ad_goals: v })} />
                  <AreaField id="ob-promo" label="Trips or offers to promote first" optional placeholder="e.g. 7-day Serengeti safari, green-season rates" value={m.promote} onChange={(v) => update("marketing", { promote: v })} />
                </section>
              </div>
            )}

            {step === "website" && (
              <div className="flex flex-col gap-5">
                <StepTitle title="Your website" intro="What we need to plan and build your site." />
                <TextField id="ob-site" label="Current website" optional placeholder="yourcompany.com" value={w.current_site} onChange={(v) => update("website", { current_site: v })} />
                <Radios legend="Your domain name" name="dom" value={w.domain_choice}
                  options={[["have", "I have a domain"], ["need", "I need one"], ["unsure", "Not sure"]]} onChange={(v) => update("website", { domain_choice: v })} />
                {w.domain_choice === "have" && (
                  <div className="flex flex-col gap-2">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField id="ob-dom" label="Domain" placeholder="yourcompany.co.tz" value={w.domain} onChange={(v) => update("website", { domain: v })} />
                      <TextField id="ob-reg" label="Registered with" placeholder="e.g. GoDaddy" value={w.registrar} onChange={(v) => update("website", { registrar: v })} />
                    </div>
                    <span className="text-xs text-slate">Don&apos;t type passwords here. We&apos;ll send simple steps to give us access.</span>
                  </div>
                )}
                {w.domain_choice === "need" && (
                  <TextField id="ob-want" label="Domain you'd like" placeholder="e.g. yourcompany.com" value={w.wanted_domain} onChange={(v) => update("website", { wanted_domain: v })} hint="We'll check it's available before buying." />
                )}
                <Chips legend="What should your website do best?" options={WEB_GOALS} value={w.goals} onChange={(v) => update("website", { goals: v })} />
                <Chips legend="Pages you need" options={PAGES} value={w.pages} onChange={(v) => update("website", { pages: v })} />
                <AreaField id="ob-likes" label="Websites you like" optional placeholder="Paste links and tell us what you like about them" value={w.likes} onChange={(v) => update("website", { likes: v })} />
              </div>
            )}

            {step === "files" && (
              <div className="flex flex-col gap-5">
                <StepTitle title="Photos and brand files" intro="Send what you have now. You can add more anytime." />
                <div className="flex flex-col gap-2 rounded-card bg-sidebar px-4 py-3.5">
                  <span className="font-semibold">What we need</span>
                  <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                    {[["Logo", "PNG or SVG, best quality you have"], ["Safari photos", "wildlife, vehicles, camps, your team"], ["Videos", "short clips, phone videos are fine"], ["Itineraries", "PDFs or Word files you send guests"], ["Brand files", "brochures, colours, fonts if you have them"]].map(([k, v]) => (
                      <li key={k} className="flex items-baseline gap-2"><span className="size-1.5 flex-none -translate-y-0.5 rounded-full bg-brand" /><span><span className="font-medium">{k}</span> <span className="text-[13px] text-slate">{v}</span></span></li>
                    ))}
                  </ul>
                </div>
                <fieldset className="flex flex-col gap-2.5">
                  <legend className="pb-2.5 font-medium">How would you like to share them?</legend>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {([["drive", "Share a Google Drive folder", "Best for lots of photos and videos. Recommended."], ["upload", "Upload here", "Good for a logo and a handful of files."]] as const).map(([v, t, d]) => (
                      <label key={v} className={"flex cursor-pointer items-start gap-3 rounded-card border-[1.5px] px-4 py-3.5 " + (f.mode === v ? "border-brand bg-[#F1FAF6]" : "border-field bg-white")}>
                        <input type="radio" name="share" className="mt-1 accent-brand" checked={f.mode === v} onChange={() => update("files", { mode: v })} />
                        <span className="flex flex-col gap-0.5"><span className="font-semibold">{t}</span><span className="text-[13px] text-slate">{d}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {f.mode === "drive" ? (
                  <div className="flex flex-col gap-3.5">
                    <ol className="list-decimal space-y-1.5 pl-5">
                      <li>Create a folder in Google Drive, e.g. &ldquo;{p.companyName} – Safari Digital&rdquo;.</li>
                      <li>Add sub-folders if you like: <span className="font-medium">Logo, Photos, Videos, Itineraries</span>.</li>
                      <li>Share it {p.driveShareEmail ? <>with <strong className="font-semibold">{p.driveShareEmail}</strong> as Editor, or</> : null} set it to &ldquo;Anyone with the link can view&rdquo;.</li>
                    </ol>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="ob-drive">Folder link</Label>
                      <Input id="ob-drive" value={f.drive_link ?? ""} aria-invalid={driveBad} placeholder="https://drive.google.com/drive/folders/…" onChange={(e) => update("files", { drive_link: e.target.value })} />
                      {driveBad && <span className="text-xs text-danger-text">That doesn&apos;t look like a Google Drive link.</span>}
                    </div>
                    <Check checked={f.drive_shared} onChange={(v) => update("files", { drive_shared: v })}>I&apos;ve shared the folder with Safari Digital</Check>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {uploadError && <Alert>{uploadError}</Alert>}
                    {FILE_CATEGORIES.map((c) => {
                      const mine = files.filter((x) => x.category === c.key);
                      return (
                        <div key={c.key} className="flex flex-col gap-2 rounded-card border border-dashed border-[#C9CDD6] px-4 py-3.5">
                          <label className="flex cursor-pointer items-center gap-3.5">
                            <span className="flex min-w-0 flex-1 flex-col"><span className="font-medium">{c.label}</span><span className="text-[13px] text-slate">{c.hint}</span></span>
                            <span className={buttonClass("secondary", "h-9")}>{uploading === c.key ? "Uploading…" : "Choose files"}</span>
                            <input type="file" className="sr-only" multiple={c.multiple} accept={c.accept} disabled={!!uploading}
                              onChange={(e) => { upload(c.key, e.target.files); e.target.value = ""; }} />
                          </label>
                          {mine.length > 0 && (
                            <ul className="flex flex-col gap-1 border-t border-line-soft pt-2">
                              {mine.map((x) => (
                                <li key={x.path} className="flex items-center justify-between gap-3 text-[13px]">
                                  <span className="flex min-w-0 items-center gap-2"><CheckIcon className="flex-none text-brand" /><span className="truncate">{x.name}</span></span>
                                  <button type="button" onClick={() => remove(x)} className="font-medium text-slate hover:text-ink">Remove</button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <AreaField id="ob-reviews" label="Guest reviews" optional placeholder="Paste a few reviews, or your TripAdvisor link" value={f.reviews} onChange={(v) => update("files", { reviews: v })} />
              </div>
            )}

            {step === "review" && (
              <div className="flex flex-col gap-5">
                <StepTitle title="Check and submit" intro="A quick look before you send everything to Safari Digital." />
                <ul className="overflow-hidden rounded-card border border-line">
                  {steps.filter((s) => s.key !== "review").map((s, i) => {
                    const warn = missing.filter((x) => x.step === s.key);
                    const note =
                      s.key === "business" ? [b.contact_name, b.whatsapp, b.markets?.length ? `${b.markets.length} guest ${b.markets.length === 1 ? "country" : "countries"}` : null].filter(Boolean).join(" · ") || "Not filled in yet"
                        : s.key === "marketing" ? (m.invite_sent ? "Access invitation sent" : "Access invitation not sent yet")
                          : s.key === "website" ? (w.domain_choice === "have" ? (w.domain || "Existing domain") : w.domain_choice === "need" ? "New domain needed" : "Domain: not sure yet")
                            : f.mode === "drive" ? (isDriveLink(f.drive_link) ? (f.drive_shared ? "Google Drive folder shared" : "Drive link added, not marked as shared") : "No Drive link yet")
                              : `${files.length} file${files.length === 1 ? "" : "s"} uploaded`;
                    return (
                      <li key={s.key} className={"flex items-center gap-3 px-4 py-3.5 " + (i ? "border-t border-line-soft" : "")}>
                        {warn.length ? <span aria-hidden className="inline-flex size-[22px] flex-none items-center justify-center rounded-full bg-warn-bg text-[13px] font-bold text-warn-text">!</span>
                          : <span className="inline-flex size-[22px] flex-none items-center justify-center rounded-full bg-[#E3F4EA] text-brand"><CheckIcon /></span>}
                        <span className="flex min-w-0 flex-1 flex-col"><span className="font-medium">{s.label}</span><span className={"text-[13px] " + (warn.length ? "text-warn-text" : "text-slate")}>{note}</span></span>
                        <button type="button" onClick={() => go(s.key)} className="h-8 rounded-badge px-2.5 font-medium text-brand hover:bg-[#F4F5F2]">Edit</button>
                      </li>
                    );
                  })}
                </ul>
                <span className="text-[13px] text-slate">Anything marked ! can be finished later. It won&apos;t stop you submitting.</span>
                {submitError && <Alert>{submitError}</Alert>}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-2">
              <Button variant="ghost" onClick={back}>Back</Button>
              {step === "review"
                ? <Button onClick={submit} disabled={submitting}>{submitting ? "Submitting…" : "Submit to Safari Digital"}</Button>
                : <Button onClick={next}>Continue</Button>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
