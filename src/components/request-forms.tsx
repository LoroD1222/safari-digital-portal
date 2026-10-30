"use client";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { ATTACHMENT, compressFile } from "@/lib/compress";
import { createRequest, replyToRequest } from "@/app/request-actions";
import { Alert, Button, Field, Input, Select, Textarea } from "./ui";
import { Icon } from "./icons";
import { CATEGORY_LABEL, type RequestCategory } from "@/lib/types";

async function uploadAttachment(picked: File, clientId: string) {
  const file = await compressFile(picked, ATTACHMENT);
  if (file.size > 20 * 1024 * 1024) return { error: "Attachments can be up to 20 MB, even after compressing." };
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${clientId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await createClient().storage.from("request-files").upload(path, file, { contentType: file.type || undefined });
  if (error) return { error: "The attachment didn't upload. " + error.message };
  return { path, name: file.name };
}

function AttachInput({ file, setFile, id }: { file: File | null; setFile: (f: File | null) => void; id: string }) {
  return (
    <div className="flex items-center gap-2 text-[13px]">
      <label htmlFor={id} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-control border border-field bg-white px-3 font-medium hover:bg-[#F4F5F2]">
        <Icon name="paperclip" size={15} />{file ? "Change file" : "Attach a file"}
      </label>
      <input id={id} type="file" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      {file && <><span className="truncate text-body">{file.name}</span><button type="button" onClick={() => setFile(null)} className="text-slate hover:text-ink">Remove</button></>}
    </div>
  );
}

export function NewRequestForm({ clientId, categories, defaultCategory = "support", submitLabel = "Send request", placeholder }: {
  clientId: string; categories: RequestCategory[]; defaultCategory?: RequestCategory; submitLabel?: string; placeholder?: string;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function submit(fd: FormData) {
    start(async () => {
      setMsg(null);
      let att: { path?: string; name?: string } = {};
      if (file) {
        const up = await uploadAttachment(file, clientId);
        if ("error" in up) { setMsg({ ok: false, text: up.error! }); return; }
        att = up;
      }
      const r = await createRequest({
        category: String(fd.get("category") ?? defaultCategory), subject: String(fd.get("subject") ?? ""), body: String(fd.get("body") ?? ""),
        attachmentPath: att.path, attachmentName: att.name,
      });
      if (r.error) { setMsg({ ok: false, text: r.error }); return; }
      form.current?.reset(); setFile(null);
      setMsg({ ok: true, text: "Sent. We'll reply here and by email." });
      router.refresh();
    });
  }

  return (
    <form ref={form} action={submit} className="flex flex-col gap-3.5">
      {categories.length > 1 ? (
        <Field label="What's it about?" htmlFor="category">
          <Select id="category" name="category" defaultValue={defaultCategory}>
            {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </Select>
        </Field>
      ) : <input type="hidden" name="category" value={categories[0]} />}
      <Field label="Subject" htmlFor="subject"><Input id="subject" name="subject" required maxLength={150} /></Field>
      <Field label="Details" htmlFor="body">
        <Textarea id="body" name="body" rows={4} required placeholder={placeholder} />
      </Field>
      <AttachInput file={file} setFile={setFile} id="new-attach" />
      {msg && <Alert tone={msg.ok ? "success" : "error"}>{msg.text}</Alert>}
      <div className="flex justify-end"><Button disabled={pending}>{pending ? "Sending…" : submitLabel}</Button></div>
    </form>
  );
}

export function ReplyForm({ requestId, clientId, placeholder = "Write a reply…" }: { requestId: string; clientId: string; placeholder?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    start(async () => {
      setErr(null);
      let att: { path?: string; name?: string } = {};
      if (file) {
        const up = await uploadAttachment(file, clientId);
        if ("error" in up) { setErr(up.error!); return; }
        att = up;
      }
      const r = await replyToRequest(requestId, text, att.path, att.name);
      if (r.error) { setErr(r.error); return; }
      setText(""); setFile(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-card border border-line px-4 py-3.5">
      <label htmlFor="reply" className="sr-only">Reply</label>
      <Textarea id="reply" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AttachInput file={file} setFile={setFile} id="reply-attach" />
        <Button type="button" onClick={send} disabled={pending || !text.trim()}>{pending ? "Sending…" : "Send"}</Button>
      </div>
      {err && <Alert>{err}</Alert>}
    </div>
  );
}
