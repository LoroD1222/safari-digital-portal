"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AD_GOALS, MARKETS, OFFERS, PAGES, WEB_GOALS, type Answers, type StoredFile } from "@/lib/onboarding";
import { Alert, Button, Input, Select, Textarea } from "@/components/ui";
import { OnboardingSummary } from "./onboarding-summary";
import { saveOnboardingAnswers } from "./manage-actions";

type Files = (StoredFile & { url: string | null })[];

// The onboarding answers, with an Edit mode for Safari Digital to correct or fill them in.
export function OnboardingAnswers({ clientId, answers, submittedAt, files }: { clientId: string; answers: Answers | null; submittedAt: string | null; files: Files }) {
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!editing) {
    return (
      <OnboardingSummary answers={answers} submittedAt={submittedAt} files={files}
        action={<div className="flex items-center gap-3">
          {saved && <span role="status" className="text-[13px] text-forest">Saved</span>}
          <Button variant="secondary" className="h-9" onClick={() => { setSaved(false); setEditing(true); }}>{answers ? "Edit answers" : "Fill in answers"}</Button>
        </div>} />
    );
  }
  return <Editor clientId={clientId} answers={answers ?? {}} onDone={(ok) => { setEditing(false); setSaved(ok); }} />;
}

function Editor({ clientId, answers, onDone }: { clientId: string; answers: Answers; onDone: (saved: boolean) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [a, setA] = useState<Answers>(() => structuredClone(answers));
  const b = a.business ?? {}, m = a.marketing ?? {}, w = a.website ?? {}, f = a.files ?? {};
  const set = <K extends "business" | "marketing" | "website" | "files">(k: K, patch: NonNullable<Answers[K]>) => setA((x) => ({ ...x, [k]: { ...x[k], ...patch } }));
  const save = () => start(async () => {
    setError(null);
    const r = await saveOnboardingAnswers(clientId, a);
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
    onDone(true);
  });

  return (
    <section aria-labelledby="ob-edit-h" className="flex flex-col gap-6 border-t border-line-soft pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="ob-edit-h" className="text-[15px] font-semibold">Edit onboarding answers</h2>
          <p className="text-[13px] text-slate">Changes save over the client&apos;s answers. They see them in their Account page, and new inquiries go to the details below.</p>
        </div>
      </div>

      <Group title="Business">
        <Text label="Contact person" value={b.contact_name} onChange={(v) => set("business", { contact_name: v })} />
        <Text label="WhatsApp" value={b.whatsapp} onChange={(v) => set("business", { whatsapp: v })} placeholder="+255 712 345 678" />
        <Long label="About" value={b.about} onChange={(v) => set("business", { about: v })} />
        <Choices label="Offers" options={OFFERS} value={b.offers} onChange={(v) => set("business", { offers: v })} />
        <Choices label="Guest countries" options={MARKETS} value={b.markets} onChange={(v) => set("business", { markets: v })} />
        <Row label="Inquiries go to">
          <Select value={b.inquiry_dest ?? ""} onChange={(e) => set("business", { inquiry_dest: (e.target.value || undefined) as "whatsapp" | "email" | "both" | undefined })}>
            <option value="">Not set</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="both">WhatsApp and email</option>
          </Select>
        </Row>
        <Text label="Inquiry email" value={b.inquiry_email} onChange={(v) => set("business", { inquiry_email: v })} type="email" placeholder="bookings@theircompany.com" />
      </Group>

      <Group title="Facebook & Instagram">
        <Text label="Instagram" value={m.instagram} onChange={(v) => set("marketing", { instagram: v })} placeholder="@theircompany" />
        <Check label="No Instagram yet, wants one set up" checked={!!m.no_instagram} onChange={(v) => set("marketing", { no_instagram: v })} />
        <Text label="Facebook page" value={m.facebook} onChange={(v) => set("marketing", { facebook: v })} />
        <Check label="Team invited (page, Instagram, ad account)" checked={!!m.people_added} onChange={(v) => set("marketing", { people_added: v })} />
        <Check label="Payment method added on the ad account" checked={!!m.payment_added} onChange={(v) => set("marketing", { payment_added: v })} />
        <Text label="Monthly ad budget ($)" value={m.budget} onChange={(v) => set("marketing", { budget: v })} inputMode="decimal" placeholder="500" />
        <Choices label="Ad goals" options={AD_GOALS} value={m.ad_goals} onChange={(v) => set("marketing", { ad_goals: v })} />
        <Long label="Promote first" value={m.promote} onChange={(v) => set("marketing", { promote: v })} />
      </Group>

      <Group title="Website">
        <Text label="Current website" value={w.current_site} onChange={(v) => set("website", { current_site: v })} placeholder="https://" />
        <Row label="Domain">
          <Select value={w.domain_choice ?? ""} onChange={(e) => set("website", { domain_choice: (e.target.value || undefined) as "have" | "need" | "unsure" | undefined })}>
            <option value="">Not set</option><option value="have">Has a domain</option><option value="need">Needs one</option><option value="unsure">Not sure</option>
          </Select>
        </Row>
        {w.domain_choice === "have" && <>
          <Text label="Domain name" value={w.domain} onChange={(v) => set("website", { domain: v })} placeholder="theircompany.com" />
          <Text label="Registered with" value={w.registrar} onChange={(v) => set("website", { registrar: v })} placeholder="GoDaddy, Namecheap…" />
        </>}
        {w.domain_choice === "need" && <Text label="Wanted domain" value={w.wanted_domain} onChange={(v) => set("website", { wanted_domain: v })} />}
        <Choices label="Goals" options={WEB_GOALS} value={w.goals} onChange={(v) => set("website", { goals: v })} />
        <Choices label="Pages" options={PAGES} value={w.pages} onChange={(v) => set("website", { pages: v })} />
        <Long label="Websites they like" value={w.likes} onChange={(v) => set("website", { likes: v })} />
      </Group>

      <Group title="Photos & brand files">
        <Row label="Sharing by">
          <Select value={f.mode ?? ""} onChange={(e) => set("files", { mode: (e.target.value || undefined) as "drive" | "upload" | undefined })}>
            <option value="">Not set</option><option value="drive">Google Drive</option><option value="upload">Upload</option>
          </Select>
        </Row>
        {f.mode === "drive" && <>
          <Text label="Drive folder" value={f.drive_link} onChange={(v) => set("files", { drive_link: v })} placeholder="https://drive.google.com/…" />
          <Check label="Folder shared with Safari Digital" checked={!!f.drive_shared} onChange={(v) => set("files", { drive_shared: v })} />
        </>}
        <Long label="Guest reviews" value={f.reviews} onChange={(v) => set("files", { reviews: v })} />
      </Group>

      {error && <Alert>{error}</Alert>}
      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t border-line-soft bg-white px-1 py-3">
        <Button className="h-10" disabled={pending} onClick={save}>{pending ? "Saving…" : "Save answers"}</Button>
        <Button variant="secondary" className="h-10" disabled={pending} onClick={() => onDone(false)}>Cancel</Button>
      </div>
    </section>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col">
      <legend className="mb-1 text-[13px] font-semibold text-slate">{title}</legend>
      <div className="flex flex-col">{children}</div>
    </fieldset>
  );
}

function Row({ label, children, htmlFor }: { label: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5 border-t border-line-soft py-2.5 sm:flex-row sm:items-start sm:gap-4">
      <label htmlFor={htmlFor} className="pt-2 text-slate sm:w-48 sm:shrink-0">{label}</label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const fid = (label: string) => "ob-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function Text({ label, value, onChange, ...rest }: { label: string; value?: string; onChange: (v: string) => void } & Omit<React.ComponentProps<"input">, "value" | "onChange">) {
  const id = fid(label);
  return <Row label={label} htmlFor={id}><Input id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} /></Row>;
}

function Long({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  const id = fid(label);
  return <Row label={label} htmlFor={id}><Textarea id={id} rows={3} value={value ?? ""} onChange={(e) => onChange(e.target.value)} /></Row>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="border-t border-line-soft py-2.5 sm:pl-52">
      <label className="flex items-center gap-2.5 text-body"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[#1A6647]" />{label}</label>
    </div>
  );
}

// Known options as chips, plus anything else the client wrote (comma separated).
function Choices({ label, options, value, onChange }: { label: string; options: readonly string[]; value?: string[]; onChange: (v: string[]) => void }) {
  const list = value ?? [];
  const extra = list.filter((x) => !options.includes(x));
  const [other, setOther] = useState(extra.join(", "));
  const toggle = (o: string) => onChange(list.includes(o) ? list.filter((x) => x !== o) : [...list, o]);
  const setExtra = (t: string) => {
    setOther(t);
    onChange([...list.filter((x) => options.includes(x)), ...t.split(",").map((x) => x.trim()).filter(Boolean)]);
  };
  return (
    <Row label={label}>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
          {options.map((o) => {
            const on = list.includes(o);
            return (
              <button key={o} type="button" aria-pressed={on} onClick={() => toggle(o)}
                className={`h-8 rounded-full border px-3 text-[13px] ${on ? "border-forest bg-[#E3F4EA] font-medium text-forest" : "border-field bg-white text-body hover:bg-[#F4F5F2]"}`}>{o}</button>
            );
          })}
        </div>
        <Input aria-label={`${label}: other`} value={other} onChange={(e) => setExtra(e.target.value)} placeholder="Other, separated by commas" className="h-9 text-[13px]" />
      </div>
    </Row>
  );
}
