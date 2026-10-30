"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Alert, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { KIND_LABEL, PLATFORM_LABEL, type ContentItem } from "@/lib/types";
import { createContent, updateContent, type ContentFormState } from "./actions";
import { uploadMedia } from "./upload";

function Details({ item, kind: k, setKind: sk }: { item?: ContentItem; kind?: string; setKind?: (k: string) => void }) {
  const [own, setOwn] = useState<string>(item?.kind ?? "reel");
  const kind = k ?? own, setKind = sk ?? setOwn;
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
      {kind === "carousel" && (
        <p className="-mt-1 text-[13px] text-slate">A carousel (slider) is 2–10 images or videos the client swipes through, as a post or an ad.</p>
      )}
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

type Uploaded = { path: string; type: string; preview: string };
const MAX_SLIDES = 10;

export function NewContentForm({ clients, defaultClient }: { clients: { id: string; name: string }[]; defaultClient?: string }) {
  const [state, action] = useActionState<ContentFormState, FormData>(createContent, {});
  const [id] = useState(() => crypto.randomUUID());
  const [clientId, setClientId] = useState(defaultClient ?? "");
  const [kind, setKind] = useState("reel");
  const [media, setMedia] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Uploading…");
  const [err, setErr] = useState<string | null>(null);
  const carousel = kind === "carousel";

  async function pick(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    if (!clientId) { setErr("Choose the client first."); return; }
    const room = carousel ? MAX_SLIDES - media.length : 1;
    const take = files.slice(0, room);
    setErr(files.length > room ? `A carousel can have up to ${MAX_SLIDES} slides.` : null);
    setBusy(true);
    const added: Uploaded[] = [];
    for (const [n, f] of take.entries()) {
      const r = await uploadMedia(f, clientId, id, 1, (t) => setStatus(take.length > 1 ? `${n + 1} of ${take.length} · ${t}` : t));
      if ("error" in r) { setErr(r.error ?? null); break; }
      added.push({ path: r.path, type: r.type, preview: URL.createObjectURL(f) });
    }
    setBusy(false);
    setMedia((m) => (carousel ? [...m, ...added] : added.slice(0, 1)));
  }
  function changeKind(k: string) {
    setKind(k);
    if (k !== "carousel") setMedia((m) => m.slice(0, 1));
  }
  const move = (n: number, d: number) => setMedia((m) => { const x = [...m]; const t = n + d; if (t < 0 || t >= x.length) return m; [x[n], x[t]] = [x[t], x[n]]; return x; });

  const first = media[0];
  const ready = carousel ? media.length >= 2 : media.length === 1;

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="media_path" value={first?.path ?? ""} />
      <input type="hidden" name="media_type" value={first?.type ?? ""} />
      <input type="hidden" name="extra_media" value={JSON.stringify(media.slice(1).map(({ path, type }) => ({ path, type })))} />
      <Field label="Client" htmlFor="client_id">
        <Select id="client_id" name="client_id" value={clientId} onChange={(e) => { setClientId(e.target.value); setMedia([]); }} disabled={busy}>
          <option value="">Choose a client</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Details kind={kind} setKind={changeKind} />
      <div className="flex flex-col gap-1.5">
        <span className="font-medium">{carousel ? `Slides · ${media.length} of up to ${MAX_SLIDES}` : "Video or image"}</span>
        {media.length > 0 && (
          <ul className="flex flex-wrap gap-3">
            {media.map((m, n) => (
              <li key={m.path} className="flex flex-col items-center gap-1.5">
                <div className="relative h-48 w-36 overflow-hidden rounded-control border border-line bg-black">
                  {m.type.startsWith("video/")
                    ? <video src={m.preview} controls={!carousel} muted={carousel} playsInline className="h-full w-full object-contain" />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={m.preview} alt="" className="h-full w-full object-contain" />}
                  {carousel && <span className="absolute left-1.5 top-1.5 rounded-badge bg-white/90 px-1.5 text-[11px] font-semibold text-forest">{n + 1}</span>}
                </div>
                <span className="flex gap-2 text-[12px] font-medium text-slate">
                  {carousel && n > 0 && <button type="button" onClick={() => move(n, -1)} className="hover:text-ink" aria-label={`Move slide ${n + 1} left`}>←</button>}
                  <button type="button" onClick={() => setMedia((x) => x.filter((_, k) => k !== n))} className="hover:text-ink">{carousel ? "Remove" : "Choose another file"}</button>
                  {carousel && n < media.length - 1 && <button type="button" onClick={() => move(n, 1)} className="hover:text-ink" aria-label={`Move slide ${n + 1} right`}>→</button>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {(carousel ? media.length < MAX_SLIDES : media.length === 0) && (
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-card border border-dashed border-field px-5 py-8 text-center hover:bg-[#FAFAF8]">
            <span className="font-medium">{busy ? status : carousel ? (media.length ? "Add more slides" : "Choose the slides (2–10)") : "Choose a video or image"}</span>
            <span className="text-xs text-slate">{busy ? "Keep this page open" : carousel ? "Select several files at once · in the order they should appear · compressed automatically" : "MP4, MOV, JPG or PNG · compressed automatically"}</span>
            <input type="file" accept="video/*,image/*" multiple={carousel} className="sr-only" disabled={busy} onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          </label>
        )}
        {carousel && media.length === 1 && <span className="text-xs text-slate">Add at least one more slide.</span>}
        {err && <Alert>{err}</Alert>}
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft pt-5">
        <Link href="/admin/content" className={buttonClass("ghost")}>Cancel</Link>
        <button name="intent" value="draft" disabled={busy} className={buttonClass("secondary")}>Save draft</button>
        <button name="intent" value="send" disabled={busy || !ready} className={buttonClass("primary")}>Send for approval</button>
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
