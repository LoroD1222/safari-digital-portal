"use client";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { deleteInvoice } from "../actions";

export function DeleteInvoice({ id, number, status }: { id: string; number: string; status: string }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" onClick={() => { setAsking(true); setError(null); }}
        className="inline-flex h-9 items-center rounded-control border border-danger px-3.5 text-[13px] font-semibold text-danger-text hover:bg-[#FDF4F3]">Delete</button>
      {asking && (
        <ConfirmDialog title={`Delete invoice ${number}?`} confirmLabel="Delete invoice" pending={pending} error={error} onClose={() => setAsking(false)}
          onConfirm={() => start(async () => { const r = await deleteInvoice(id); if (r?.error) setError(r.error); })}>
          <p>It&apos;s removed for good, including from the client&apos;s Billing page, and can&apos;t be brought back.{status === "paid" ? " It's marked paid, so it also drops out of your paid totals." : ""}</p>
          {status !== "draft" && <p className="mt-2">If it was already sent and you just don&apos;t want it to count, <strong className="font-semibold">Cancel invoice</strong> keeps a record instead. The number {number} won&apos;t be reused.</p>}
        </ConfirmDialog>
      )}
    </>
  );
}
