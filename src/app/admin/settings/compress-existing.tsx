"use client";
import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ATTACHMENT, CONTENT_MEDIA, TUTORIAL_VIDEO, compressFile, type CompressOptions } from "@/lib/compress";
import { Alert, Button } from "@/components/ui";

// Compresses files already in storage, in this browser, with the admin's login.
// Each file is replaced at the same path, so every link and reference keeps working.
type Bucket = { id: string; label: string; opts: CompressOptions; note: string; defaultOn: boolean };
const BUCKETS: Bucket[] = [
  { id: "content", label: "Content (Reels, posts, ads)", opts: CONTENT_MEDIA, note: "Full HD, good quality for Instagram & Facebook", defaultOn: true },
  { id: "tutorials", label: "Onboarding & training videos", opts: TUTORIAL_VIDEO, note: "1080p", defaultOn: true },
  { id: "request-files", label: "Request attachments", opts: ATTACHMENT, note: "Images up to 2400 px, videos 720p", defaultOn: true },
  { id: "client-files", label: "Client onboarding uploads", opts: CONTENT_MEDIA, note: "Clients' original photos and footage. Leave off if you edit from these originals.", defaultOn: false },
];
const MEDIA = /\.(jpe?g|png|webp|mp4|mov|m4v|webm)$/i;
const TYPE: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

type Item = { bucket: string; path: string; size: number };
type Line = { path: string; text: string; tone: "ok" | "skip" | "err" | "busy" };
const mb = (n: number) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB";

export function CompressExisting() {
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(BUCKETS.map((b) => [b.id, b.defaultOn])));
  const [items, setItems] = useState<Item[] | null>(null);
  const [phase, setPhase] = useState<"idle" | "scanning" | "ready" | "running" | "done">("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [saved, setSaved] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  async function scan() {
    setPhase("scanning"); setError(null); setLines([]); setSaved(0); setDoneCount(0);
    const supabase = createClient();
    const found: Item[] = [];
    async function walk(bucket: string, prefix: string) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error: e } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset });
        if (e) throw new Error(`${bucket}: ${e.message}`);
        for (const f of data ?? []) {
          const path = prefix ? `${prefix}/${f.name}` : f.name;
          if (f.id === null) await walk(bucket, path);
          else if (MEDIA.test(f.name)) found.push({ bucket, path, size: Number(f.metadata?.size ?? 0) });
        }
        if (!data || data.length < 1000) break;
      }
    }
    try {
      for (const b of BUCKETS) if (on[b.id]) await walk(b.id, "");
      setItems(found.sort((a, b) => b.size - a.size));
      setPhase("ready");
    } catch (e) {
      setError("Couldn't list the files. " + (e as Error).message);
      setPhase("idle");
    }
  }

  async function run() {
    if (!items) return;
    stop.current = false; setPhase("running");
    const supabase = createClient();
    const log = (l: Line) => setLines((x) => [l, ...x.filter((y) => y.path !== l.path)].slice(0, 200));
    let total = 0;
    for (let i = 0; i < items.length; i++) {
      if (stop.current) break;
      const it = items[i];
      const key = `${it.bucket}/${it.path}`;
      const name = it.path.split("/").pop()!;
      try {
        log({ path: key, text: "Downloading…", tone: "busy" });
        const { data: blob, error: de } = await supabase.storage.from(it.bucket).download(it.path);
        if (de || !blob) throw new Error(de?.message ?? "download failed");
        const ext = name.split(".").pop()!.toLowerCase();
        const original = new File([blob], name, { type: blob.type && blob.type !== "application/octet-stream" ? blob.type : TYPE[ext] ?? "" });
        const opts = BUCKETS.find((b) => b.id === it.bucket)!.opts;
        const out = await compressFile(original, { ...opts, onProgress: (p) => log({ path: key, text: `Compressing… ${p}%`, tone: "busy" }) });
        if (out === original) { log({ path: key, text: `Kept · already small (${mb(original.size)})`, tone: "skip" }); continue; }
        log({ path: key, text: "Replacing…", tone: "busy" });
        const { error: ue } = await supabase.storage.from(it.bucket).upload(it.path, out, { upsert: true, contentType: out.type, cacheControl: "3600" });
        if (ue) throw new Error(ue.message);
        if (it.bucket === "content") await supabase.from("content_items").update({ media_type: out.type }).eq("media_path", it.path);
        total += original.size - out.size;
        setSaved(total);
        log({ path: key, text: `${mb(original.size)} → ${mb(out.size)}`, tone: "ok" });
      } catch (e) {
        log({ path: key, text: "Skipped · " + (e as Error).message, tone: "err" });
      } finally {
        setDoneCount(i + 1);
      }
    }
    setPhase("done");
  }

  const totalSize = items?.reduce((a, b) => a + b.size, 0) ?? 0;
  const busy = phase === "scanning" || phase === "running";

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="sr-only">Folders to compress</legend>
        {BUCKETS.map((b) => (
          <label key={b.id} className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={on[b.id]} onChange={(e) => { setOn({ ...on, [b.id]: e.target.checked }); setItems(null); setPhase("idle"); }} className="mt-1 size-4 accent-[#1A6647]" />
            <span className="flex flex-col"><span className="font-medium">{b.label}</span><span className="text-[13px] text-slate">{b.note}</span></span>
          </label>
        ))}
      </fieldset>

      {error && <Alert>{error}</Alert>}

      {phase === "idle" || phase === "scanning" ? (
        <div><Button type="button" variant="secondary" onClick={scan} disabled={busy || !Object.values(on).some(Boolean)}>{phase === "scanning" ? "Looking for files…" : "Find files"}</Button></div>
      ) : (
        <div className="flex flex-col gap-3 rounded-card border border-line px-4 py-3.5">
          <p className="text-[13px] text-body">
            <span className="font-semibold text-ink">{items?.length ?? 0} images and videos</span> · {mb(totalSize)} in total
            {phase !== "ready" && <> · done {doneCount} of {items?.length} · <span className="font-semibold text-forest">saved {mb(saved)}</span></>}
          </p>
          {phase === "ready" && (
            <>
              <p className="text-[13px] text-slate">Files are replaced with the smaller version (this can&apos;t be undone). Files that are already small, or that this browser can&apos;t read, are left as they are. Keep this tab open until it finishes.</p>
              <div className="flex gap-2">
                <Button type="button" onClick={run} disabled={!items?.length}>Compress {items?.length} files</Button>
                <Button type="button" variant="ghost" onClick={() => { setItems(null); setPhase("idle"); }}>Cancel</Button>
              </div>
            </>
          )}
          {phase === "running" && <div><Button type="button" variant="secondary" onClick={() => { stop.current = true; }}>Stop after this file</Button></div>}
          {phase === "done" && <p className="text-[13px] font-medium text-forest">Finished. Saved {mb(saved)}.</p>}
          {lines.length > 0 && (
            <ul className="flex max-h-72 flex-col gap-1 overflow-auto border-t border-line-soft pt-2 text-[12px]">
              {lines.map((l) => (
                <li key={l.path} className="flex justify-between gap-3">
                  <span className="truncate text-slate">{l.path}</span>
                  <span className={"shrink-0 " + (l.tone === "ok" ? "text-forest" : l.tone === "err" ? "text-danger-text" : l.tone === "busy" ? "text-ink" : "text-slate")}>{l.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
