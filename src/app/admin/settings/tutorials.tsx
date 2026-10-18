"use client";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button, Input } from "@/components/ui";
import { toEmbed } from "@/components/video-embed";
import { addTutorial, removeTutorial } from "./tutorial-actions";

export function WebsiteTutorials({ items }: { items: { id: string; title: string; url: string }[] }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const bad = !!url.trim() && !toEmbed(url);

  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { setErr("That video is over 50 MB. Upload it to YouTube (Unlisted) and paste the link instead."); return; }
    setBusy(true); setErr(null);
    const supabase = createClient();
    const path = `website-${new Date().getTime()}.${(file.name.split(".").pop() || "mp4").toLowerCase()}`;
    const { error } = await supabase.storage.from("tutorials").upload(path, file, { contentType: file.type || "video/mp4" });
    setBusy(false);
    if (error) { setErr("The upload didn't work. " + error.message); return; }
    setUrl(supabase.storage.from("tutorials").getPublicUrl(path).data.publicUrl);
  }

  return (
    <div className="flex flex-col gap-4 rounded-card border border-line px-5 py-4">
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold">Website training videos</span>
        <span className="text-[13px] text-slate">Shown to website clients under Website → Management.</span>
      </div>
      {items.length > 0 && (
        <ul className="flex flex-col">
          {items.map((t) => (
            <li key={t.id} className="flex items-center gap-3 border-t border-line-soft py-2 first:border-t-0">
              <span className="min-w-0 flex-1 truncate">{t.title}</span>
              <button type="button" disabled={pending} onClick={() => start(() => removeTutorial(t.id))} className="text-[13px] font-medium text-slate hover:text-ink">Remove</button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 border-t border-line-soft pt-4">
        <label htmlFor="tut-title" className="text-[13px] font-medium">Add a video</label>
        <Input id="tut-title" placeholder="How to edit a safari itinerary" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Input aria-label="Video link" className="min-w-[220px] flex-1" placeholder="YouTube, Loom, Vimeo or Google Drive link" value={url} onChange={(e) => setUrl(e.target.value)} aria-invalid={bad} />
          <label className="inline-flex h-10 cursor-pointer items-center rounded-control border border-field bg-white px-4 font-medium hover:bg-[#F4F5F2]">
            {busy ? "Uploading…" : "Upload video"}
            <input type="file" accept="video/mp4,video/webm,video/quicktime" className="sr-only" disabled={busy} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <Button type="button" disabled={pending || busy || !title.trim() || !url.trim() || bad}
            onClick={() => start(async () => { const r = await addTutorial(title, url); if (r.error) setErr(r.error); else { setTitle(""); setUrl(""); setErr(null); } })}>
            Add
          </Button>
        </div>
        {bad && <span className="text-xs text-danger-text">We can&apos;t play this link. Use a YouTube, Loom, Vimeo or Google Drive (shared) link.</span>}
        {err && <Alert>{err}</Alert>}
      </div>
    </div>
  );
}
