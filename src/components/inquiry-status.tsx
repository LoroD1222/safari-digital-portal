"use client";
import { useOptimistic, useTransition } from "react";
import { updateInquiryStatus } from "@/app/inquiry-actions";
import { INQUIRY_LABEL, STAGES, type InquiryStatus } from "@/lib/types";

const ORDER: InquiryStatus[] = STAGES;

export function InquiryStatusPicker({ id, status }: { id: string; status: InquiryStatus }) {
  const [pending, start] = useTransition();
  const [shown, setShown] = useOptimistic(status);
  return (
    <div role="radiogroup" aria-label="Status" className="inline-flex flex-wrap rounded-control bg-[#F1F2F4] p-[3px]">
      {ORDER.map((s) => (
        <button key={s} type="button" role="radio" aria-checked={shown === s} disabled={pending}
          onClick={() => start(async () => { setShown(s); await updateInquiryStatus(id, s); })}
          className={"h-8 rounded-badge px-3 text-[13px] font-medium " + (shown === s ? "bg-white text-ink shadow-[0_1px_2px_rgba(0,3,33,0.12)]" : "text-body hover:text-ink")}>
          {INQUIRY_LABEL[s]}
        </button>
      ))}
    </div>
  );
}
