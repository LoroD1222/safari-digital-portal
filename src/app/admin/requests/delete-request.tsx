"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteRequests } from "@/app/request-actions";

export function DeleteRequest({ id, subject }: { id: string; subject: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" onClick={() => { setAsking(true); setError(null); }}
        className="h-9 rounded-control border border-danger px-3.5 text-[13px] font-semibold text-danger-text hover:bg-[#FDF4F3]">Delete request</button>
      {asking && (
        <ConfirmDialog title={`Delete “${subject}”?`} confirmLabel="Delete" pending={pending} error={error} onClose={() => setAsking(false)}
          onConfirm={() => start(async () => { const r = await deleteRequests([id]); if (r.error) setError(r.error); else router.push("/admin/requests?deleted=1"); })}>
          The whole conversation and its attachments are removed for the client too, and can&apos;t be brought back. To close a finished request, mark it Completed instead.
        </ConfirmDialog>
      )}
    </>
  );
}
