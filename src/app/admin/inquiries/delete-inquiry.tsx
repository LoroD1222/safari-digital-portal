"use client";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteInquiry } from "./actions";

export function DeleteInquiry({ id, name }: { id: string; name: string }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" onClick={() => { setAsking(true); setError(null); }}
        className="h-9 rounded-control border border-danger px-3.5 text-[13px] font-semibold text-danger-text hover:bg-[#FDF4F3]">Delete inquiry</button>
      {asking && (
        <ConfirmDialog title={`Delete ${name}'s inquiry?`} confirmLabel="Delete" pending={pending} error={error}
          onConfirm={() => start(async () => { const r = await deleteInquiry(id); if (r?.error) setError(r.error); })} onClose={() => setAsking(false)}>
          It&apos;s removed for the client too, and can&apos;t be brought back. For a real inquiry that went nowhere, set the status to Closed instead.
        </ConfirmDialog>
      )}
    </>
  );
}
