"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { KIND_LABEL, PLATFORM_LABEL, type ContentItem } from "@/lib/types";
import { createContent, updateContent, type ContentFormState } from "./actions";
import { uploadMedia } from "./upload";

function Details({ item }: { item?: ContentItem }) {
  const [kind, setKind] = useState<string>(item?.kind ?? "reel");
  return (
    <>
      <Field label="Title" htmlFor="title" hint="Only for you and the client, not posted.">
        <Input id="title" name="title" required defaultValue={item?.title ?? ""} placeholder="Big Five at sunrise" />
      </Field>
      <Field label="Caption" htmlFor="caption" optional>
        <Textarea id="caption" name="caption" rows={5} defaultValue={item?.caption ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type" htmlFor="kind">
          <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Platform" htmlFor="platform">
          <Select id="platform" name="platform" defaultValue={item?.platform ?? "both"}>
            {Object.entries(PLATFORM_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Publishing date" htmlFor="scheduled_for" optional>
          <Input id="scheduled_for" name="scheduled_for" type="date" defaultValue={item?.scheduled_for ?? ""} />
        </Field>
      </div>
      {kind === "ad" ? (
        <p className="rounded-control border border-line bg-sidebar px-3.5 py-3 text-[13px] text-slate">
          <span className="font-medium text-ink">Ad only.</span> The client approves it as a Facebook &amp; Instagram ad. It isn&apos;t posted on their page, and it shows on their Advertising tab.
        </p>
      ) : (
      <label className="flex cursor-pointer items-start gap-3 rounded-control border border-line bg-sidebar px-3.5 py-3">
        <input type="checkbox" name="as_ad" defaultChecked={item?.as_ad ?? false} className="mt-0.5 size-4 accent-[#1A6647]" />
        <span className="flex flex-col gap-0.5">
          <span className="font-medium">Also run as an ad</span>
          <span className="text-[13px] text-slate">The client approves it as a Facebook &amp; Instagram ad, and it shows on their Advertising tab.</span>
        </span>
      </label>
      )}
    </>
  );
}

export function NewContentForm({ clients, defaultClient }: { clients: { id: string; name: string }[]; defaultClient?: string }) {
  const [state, action] = useActionState<ContentFormState, FormData>(createContent, {});
  const [id] = useState(() => crypto.randomUUID());
  const [clientId, setClientId] = useState(defaultClient ?? "");
  const [media, setMedia] = useState<{ path: string; type: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(file?: File) {
    if (!file) return;
    if (!clientId) { setErr("Choose the client first."); return; }
    setErr(null); setBusy(true);
    const r = await uploadMedia(file, clientId, id, 1);
    setBusy(false);
    if ("error" in r) { setErr(r.error ?? null); return; }
    setMedia({ path: r.path, type: r.type, preview: URL.createObjectURL(file) });
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="media_path" value={media?.path ?? ""} />
      <input type="hidden" name="media_type" value={media?.type ?? ""} />
      <Field label="Client" htmlFor="client_id">
        <Select id="client_id" name="client_id" value={clientId} onChange={(e) => { setClientId(e.target.value); setMedia(null); }} disabled={busy}>
          <option value="">Choose a client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <div className="flex flex-col gap-1.5">
        <span className="font-medium">Video or image</span>
        {media ? (
          <div className="flex items-start gap-4">
            <div className="h-48 w-36 overflow-hidden rounded-control border border-line bg-black">
              {media.type.startsWith("video/")
                ? <video src={media.preview} controls playsInline className="h-full w-full object-contain" />
                // eslint-disable-next-line @next/next/no-img-element
                : <img src={media.preview} alt="" className="h-full w-full object-contain" />}
            </div>
            <button type="button" onClick={() => setMedia(null)} className="text-[13px] font-medium text-slate hover:text-ink">Choose another file</button>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-card border border-dashed border-field px-5 py-8 text-center hover:bg-[#FAFAF8]">
            <span className="font-medium">{busy ? "Uploading…" : "Choose a video or image"}</span>
            <span className="text-xs text-slate">MP4, MOV, JPG or PNG</span>
            <input type="file" accept="video/*,image/*" className="sr-only" disabled={busy} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
        )}
        {err && <Alert>{err}</Alert>}
      </div>
      <Details />
      {state.error && <Alert>{state.error}</Alert>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft pt-5">
        <Link href="/admin/content" className={buttonClass("ghost")}>Cancel</Link>
        <button name="intent" value="draft" disabled={busy} className={buttonClass("secondary")}>Save draft</button>
        <button name="intent" value="send" disabled={busy || !media} className={buttonClass("primary")}>Send for approval</button>
      </div>
    </form>
  );
}

export function EditContentForm({ item }: { item: ContentItem }) {
  const [state, action] = useActionState<ContentFormState, FormData>(updateContent.bind(null, item.id), {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <Details item={item} />
      {state.error && <Alert>{state.error}</Alert>}
      {state.saved && <Alert tone="success">Saved.</Alert>}
      <div className="flex justify-end"><button className={buttonClass("secondary")}>Save details</button></div>
    </form>
  );
}
