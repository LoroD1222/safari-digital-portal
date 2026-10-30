"use client";
import { useActionState, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TUTORIAL_VIDEO, compressFile } from "@/lib/compress";
import { Alert, Field, Input, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { VideoEmbed, toEmbed } from "@/components/video-embed";
import { saveSettings, type SettingsState } from "./actions";
import type { Settings } from "@/lib/settings";

function VideoSetting({ name, label, where, initial }: { name: string; label: string; where: string; initial: string }) {
  const [url, setUrl] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Uploading…");
  const [err, setErr] = useState<string | null>(null);
  const bad = !!url.trim() && !toEmbed(url);

  async function upload(picked?: File) {
    if (!picked) return;
    setErr(null); setBusy(true); setStatus("Compressing…");
    const file = await compressFile(picked, { ...TUTORIAL_VIDEO, onProgress: (p) => setStatus(`Compressing… ${p}%`) });
    setStatus("Uploading…"); setBusy(false);
    if (file.size > 50 * 1024 * 1024) { setErr("That video is over 50 MB. Upload it to YouTube (Unlisted) and paste the link instead."); return; }
    setErr(null); setBusy(true);
    const supabase = createClient();
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
    const path = `${name}-${new Date().getTime()}.${ext}`;
    const { error } = await supabase.storage.from("tutorials").upload(path, file, { contentType: file.type || "video/mp4" });
    setBusy(false);
    if (error) { setErr("The upload didn't work. " + error.message); return; }
    setUrl(supabase.storage.from("tutorials").getPublicUrl(path).data.publicUrl);
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-line px-5 py-4">
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold">{label}</span>
        <span className="text-[13px] text-slate">Shown in onboarding: {where}</span>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
          <label htmlFor={name} className="text-[13px] font-medium">Video link</label>
          <Input id={name} name={name} value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={bad}
            placeholder="YouTube, Loom, Vimeo or Google Drive link" />
        </div>
        <label className="inline-flex h-10 cursor-pointer items-center rounded-control border border-field bg-white px-4 font-medium hover:bg-[#F4F5F2]">
          {busy ? status : "Upload video"}
          <input type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" disabled={busy}
            onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        {url && <button type="button" onClick={() => setUrl("")} className="h-10 px-2 text-[13px] font-medium text-slate hover:text-ink">Remove</button>}
      </div>
      {bad && <span className="text-xs text-danger-text">We can&apos;t play this link. Use a YouTube, Loom, Vimeo or Google Drive (shared) link.</span>}
      {err && <Alert>{err}</Alert>}
      {url && !bad && <div className="max-w-md"><VideoEmbed url={url} title={label} /></div>}
    </div>
  );
}

export function SettingsForm({ initial }: { initial: Settings }) {
  const [state, action] = useActionState<SettingsState, FormData>(saveSettings, {});
  const v = (k: keyof Settings) => state.values?.[k] ?? initial[k] ?? "";
  return (
    <form action={action} className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold">Tutorial videos</h2>
          <p className="text-[13px] text-slate">Short how-to videos clients see while onboarding. Paste a link, or upload a video up to 50 MB. YouTube set to <em>Unlisted</em> works well for longer videos.</p>
        </div>
        <VideoSetting name="meta_video_url" label="How to give Safari Digital access in Meta" where="Facebook & Instagram step, above the access instructions" initial={v("meta_video_url")} />
        <VideoSetting name="drive_video_url" label="How to share a Google Drive folder" where="Photos & brand files step" initial={v("drive_video_url")} />
      </section>
      <section className="flex flex-col gap-4 border-t border-line-soft pt-6">
        <h2 className="text-[15px] font-semibold">Details shown to clients</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Meta Business ID" htmlFor="meta_business_id" hint="Clients add this as a partner in Meta Business Suite.">
            <Input id="meta_business_id" name="meta_business_id" defaultValue={v("meta_business_id")} inputMode="numeric" />
          </Field>
          <Field label="Email to share Drive folders with" htmlFor="drive_share_email" hint="Leave empty to ask for 'Anyone with the link'.">
            <Input id="drive_share_email" name="drive_share_email" type="email" defaultValue={v("drive_share_email")} />
          </Field>
          <Field label="Support WhatsApp number" htmlFor="support_whatsapp" hint="Shows a WhatsApp button on the client Help page.">
            <Input id="support_whatsapp" name="support_whatsapp" type="tel" placeholder="+255 7…" defaultValue={v("support_whatsapp")} />
          </Field>
          <Field label="Support email" htmlFor="support_email" hint="Shows a “Send an email” button in the client Help panel.">
            <Input id="support_email" name="support_email" type="email" placeholder="hello@safaridigital.co.tz" defaultValue={v("support_email")} />
          </Field>
          <Field label="Send staff notifications to" htmlFor="staff_email" hint="Empty = every admin's sign-in email. Separate several with commas.">
            <Input id="staff_email" name="staff_email" defaultValue={v("staff_email")} placeholder="hello@safaridigital.co.tz" />
          </Field>
        </div>
      </section>
      <section className="flex flex-col gap-4 border-t border-line-soft pt-6">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold">Invoices</h2>
          <p className="text-[13px] text-slate">Printed on every invoice PDF and in invoice emails.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="M-Pesa number" htmlFor="mpesa_number"><Input id="mpesa_number" name="mpesa_number" defaultValue={v("mpesa_number")} /></Field>
          <Field label="M-Pesa name" htmlFor="mpesa_name" hint="As it appears when the client pays."><Input id="mpesa_name" name="mpesa_name" defaultValue={v("mpesa_name")} /></Field>
          <Field label="Billed from" htmlFor="invoice_from" hint="Company name, address, website and phone, one per line.">
            <Textarea id="invoice_from" name="invoice_from" rows={5} defaultValue={v("invoice_from")} />
          </Field>
          <div className="flex flex-col gap-4">
            <Field label="TIN" htmlFor="invoice_tin" optional hint="Tax ID, if you invoice as a registered company."><Input id="invoice_tin" name="invoice_tin" defaultValue={v("invoice_tin")} /></Field>
          </div>
        </div>
        <Field label="Payment terms" htmlFor="invoice_terms" hint="Shown in the M-Pesa box on unpaid invoices.">
          <Textarea id="invoice_terms" name="invoice_terms" rows={3} defaultValue={v("invoice_terms")} />
        </Field>
      </section>
      {state.error && <Alert>{state.error}</Alert>}
      {state.saved && <Alert tone="success">Saved. Clients see the changes straight away.</Alert>}
      <div className="flex justify-end border-t border-line-soft pt-5"><SubmitButton>Save settings</SubmitButton></div>
    </form>
  );
}
