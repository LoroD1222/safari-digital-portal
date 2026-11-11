"use client";
import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { resendInquiryAlert } from "./actions";

// Emails the client the "New inquiry" alert for this lead again.
export function ResendAlert({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <button type="button" disabled={pending} onClick={() => start(async () => { setMsg(null); const r = await resendInquiryAlert(id); setMsg({ ok: r.ok, text: r.message }); })}
        className="flex h-9 items-center gap-1.5 rounded-control border border-field bg-white px-3.5 text-[13px] font-medium hover:bg-[#F4F5F2] disabled:opacity-60">
        <Icon name="send" size={15} />{pending ? "Sending…" : "Send to client again"}
      </button>
      {msg && <span role="status" className={`max-w-[280px] text-right text-xs ${msg.ok ? "text-forest" : "text-danger-text"}`}>{msg.text}</span>}
    </span>
  );
}
