"use client";
import { useState } from "react";
import { Alert, Button, Textarea } from "@/components/ui";
import { uploadMedia } from "./upload";
import { uploadRevision } from "./actions";

export function RevisionUpload({ id, clientId, version, carousel }: { id: string; clientId: string; version: number; carousel?: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Uploading…");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (!files.length) return;
    if (carousel && files.length < 2) { setMsg({ ok: false, text: "A carousel needs at least 2 slides." }); return; }
    setBusy(true); setMsg(null);
    const done: { path: string; type: string }[] = [];
    for (const [n, f] of files.entries()) {
      const up = await uploadMedia(f, clientId, id, version + 1, (t) => setStatus(files.length > 1 ? `${n + 1} of ${files.length} · ${t}` : t));
      if ("error" in up) { setBusy(false); setMsg({ ok: false, text: up.error ?? "Upload failed." }); return; }
      done.push({ path: up.path, type: up.type });
    }
    const [first, ...rest] = done;
    const r = await uploadRevision(id, first.path, first.type, note, carousel ? rest : undefined);
    setBusy(false);
    if (r.error) setMsg({ ok: false, text: r.error });
    else { setMsg({ ok: true, text: "New version sent to the client for approval." }); setFiles([]); setNote(""); }
  }

  const label = files.length === 0
    ? (carousel ? "Choose all the slides, in order (2–10)" : "Choose the new video or image")
    : files.length === 1 ? files[0].name : `${files.length} slides: ${files.map((f) => f.name).join(", ")}`;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-control border border-dashed border-field px-4 py-3 hover:bg-[#FAFAF8]">
        <span className="truncate">{label}</span>
        <span className="text-[13px] font-medium text-brand">Browse</span>
        <input type="file" accept="video/*,image/*" multiple={carousel} className="sr-only"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, carousel ? 10 : 1))} />
      </label>
      <label htmlFor="rev-note" className="sr-only">What changed</label>
      <Textarea id="rev-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed (optional)" />
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <div className="flex justify-end"><Button type="button" onClick={send} disabled={!files.length || busy}>{busy ? status : "Upload & send for approval"}</Button></div>
    </div>
  );
}
