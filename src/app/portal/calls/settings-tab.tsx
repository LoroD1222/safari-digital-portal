"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Textarea } from "@/components/ui";
import { DEFAULT_BODY, DEFAULT_SCRIPT, DEFAULT_SUBJECT, DEFAULT_WHATSAPP, prettyPhone, shortDay, eatDate, type CallSettings } from "@/lib/calls";
import { addDnc, removeDnc, saveCallSettings } from "./actions";
import type { Dnc, Sender } from "./calls-view";

const TAGS = "{{first_name}} {{company}} {{city}} {{country}} {{agent_name}} {{our_company}}";

export function SettingsTab({ settings, dnc, sender, onToast }: { settings: CallSettings; dnc: Dnc[]; sender: Sender; onToast: (m: string) => void }) {
  const router = useRouter();
  const [v, setV] = useState({
    default_script: settings.default_script ?? DEFAULT_SCRIPT, daily_target: String(settings.daily_target), whatsapp_intro: settings.whatsapp_intro ?? DEFAULT_WHATSAPP,
    interested_subject: settings.interested_subject ?? DEFAULT_SUBJECT, interested_body: settings.interested_body ?? DEFAULT_BODY,
    case_study_url: settings.case_study_url ?? "", case_study_name: settings.case_study_name ?? "",
  });
  const [numbers, setNumbers] = useState("");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((x) => ({ ...x, [k]: e.target.value }));
  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) { setError(r.error); return; }
    if (r.message) onToast(r.message);
    after?.(); router.refresh();
  });
  const shown = dnc.filter((d) => !search || d.phone.includes(search.replace(/\D/g, "")) || (d.reason ?? "").toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-5">
        {error && <Alert>{error}</Alert>}
        <section className="flex flex-col gap-3 rounded-card border border-line p-5">
          <div>
            <h2 className="text-[15px] font-semibold">Call script</h2>
            <p className="text-[13px] text-slate">Shown next to every call. A list can have its own script instead (Lists › Name &amp; script).</p>
          </div>
          <Textarea rows={16} value={v.default_script} onChange={set("default_script")} className="text-[13px]" />
          <span className="text-xs text-slate">Leave a blank line between steps; the first line of each step is its title. Put what the client might say in brackets. Tags: {TAGS}</span>
          {v.default_script !== DEFAULT_SCRIPT && <button type="button" onClick={() => setV((x) => ({ ...x, default_script: DEFAULT_SCRIPT }))} className="self-start text-[13px] font-medium text-brand">Reset to the standard script</button>}
        </section>

        <section className="flex flex-col gap-3 rounded-card border border-line p-5">
          <h2 className="text-[15px] font-semibold">Daily target</h2>
          <label className="flex max-w-[260px] flex-col gap-1 text-[13px] font-medium">Calls per day, for the whole team<Input type="number" min={1} max={500} value={v.daily_target} onChange={set("daily_target")} /></label>
        </section>

        <section className="flex flex-col gap-3 rounded-card border border-line p-5">
          <div>
            <h2 className="text-[15px] font-semibold">WhatsApp intro after a missed call</h2>
            <p className="text-[13px] text-slate">After &ldquo;No answer&rdquo; you get a button that opens WhatsApp with this message ready to send from your phone or WhatsApp Web.</p>
          </div>
          <Textarea rows={4} value={v.whatsapp_intro} onChange={set("whatsapp_intro")} />
          <span className="text-xs text-slate">Tags: {TAGS}</span>
        </section>

        <section className="flex flex-col gap-3 rounded-card border border-line p-5">
          <div>
            <h2 className="text-[15px] font-semibold">Email after an &ldquo;Interested&rdquo; call</h2>
            <p className="text-[13px] text-slate">
              {sender.ready ? <>Sent from {sender.email}, the address connected under <Link href="/portal/followups">Follow-ups</Link>. Your signature is added at the end.</>
                : <>Connect an email address under <Link href="/portal/followups">Follow-ups</Link> first; this email is sent from it.</>}
            </p>
          </div>
          <label className="flex flex-col gap-1 text-[13px] font-medium">Subject<Input value={v.interested_subject} onChange={set("interested_subject")} /></label>
          <label className="flex flex-col gap-1 text-[13px] font-medium">Message<Textarea rows={8} value={v.interested_body} onChange={set("interested_body")} /></label>
          <span className="text-xs text-slate">Tags: {TAGS}. Without a case study, the line that mentions the attachment is left out.</span>
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_200px]">
            <label className="flex flex-col gap-1 text-[13px] font-medium">Case study link
              <Input type="url" value={v.case_study_url} onChange={set("case_study_url")} placeholder="https://…/case-study.pdf" />
              <span className="text-xs font-normal text-slate">A link that downloads the PDF directly (e.g. a public Supabase Storage or Dropbox ?dl=1 link). It&apos;s attached to the email.</span>
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium">File name<Input value={v.case_study_name} onChange={set("case_study_name")} placeholder="Case study.pdf" /></label>
          </div>
        </section>
        <div><Button disabled={pending} onClick={() => run(() => saveCallSettings({ ...v, daily_target: Number(v.daily_target) }))}>{pending ? "Saving…" : "Save settings"}</Button></div>
      </div>

      <section aria-labelledby="dnc-title" className="flex flex-col gap-3 rounded-card border border-line p-5">
        <div>
          <h2 id="dnc-title" className="text-[15px] font-semibold">Do not call</h2>
          <p className="text-[13px] text-slate">These numbers are skipped on every upload and taken out of every list. &ldquo;Not interested&rdquo; can add a number here too.</p>
        </div>
        <Textarea rows={3} value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder={"0754 123 456\n+255 713 000 111"} aria-label="Numbers to add" />
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional), e.g. Asked not to be called" aria-label="Reason" />
        <Button variant="secondary" disabled={pending || !numbers.trim()} onClick={() => run(() => addDnc(numbers, reason), () => { setNumbers(""); setReason(""); })}>Add to Do not call</Button>
        <div className="border-t border-line pt-3">
          {dnc.length > 8 && <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search numbers" aria-label="Search Do not call" className="mb-2 h-9" />}
          {dnc.length === 0 ? <p className="text-[13px] text-slate">No numbers yet.</p> : (
            <ul className="flex max-h-[420px] flex-col overflow-y-auto">
              {shown.slice(0, 300).map((d) => (
                <li key={d.phone} className="flex items-center gap-2 border-b border-[#F1F2F4] py-2 text-[13px] last:border-0">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="tabular-nums">{prettyPhone(d.phone)}</span>
                    <span className="truncate text-xs text-slate">{[d.reason, shortDay(eatDate(d.created_at))].filter(Boolean).join(" · ")}</span>
                  </span>
                  <button type="button" disabled={pending} onClick={() => run(() => removeDnc(d.phone))} className="text-[13px] font-medium text-slate hover:text-ink">Remove</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
