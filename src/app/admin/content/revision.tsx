"use client";
import { useState } from "react";
import { Alert, Button, Textarea } from "@/components/ui";
import { uploadMedia } from "./upload";
import { uploadRevision } from "./actions";

export function RevisionUpload({ id, clientId, version }: { id: string; clientId: string; version: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    if (!file) return;
    setBusy(true); setMsg(null);
    const up = await uploadMedia(file, clientId, id, version + 1);
    if ("error" in up) { setBusy(false); setMsg({ ok: false, text: up.error ?? "Upload failed." }); return; }
    const r = await uploadRevision(id, up.path, up.type, note);
    setBusy(false);
    if (r.error) setMsg({ ok: false, text: r.error });
    else { setMsg({ ok: true, text: "New version sent to the client for approval." }); setFile(null); setNote(""); }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-control border border-dashed border-field px-4 py-3 hover:bg-[#FAFAF8]">
        <span className="truncate">{file ? file.name : "Choose the new video or image"}</span>
        <span className="text-[13px] font-medium text-brand">Browse</span>
        <input type="file" accept="video/*,image/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <label htmlFor="rev-note" className="sr-only">What changed</label>
      <Textarea id="rev-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed (optional)" />
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <div className="flex justify-end"><Button type="button" onClick={send} disabled={!file || busy}>{busy ? "Uploading…" : "Upload & send for approval"}</Button></div>
    </div>
  );
}
