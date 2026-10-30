"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { InquiryDialog } from "@/components/inquiry-dialog";
import type { Inquiry } from "@/lib/types";

// Links from emails open the inquiry in the same window as the pipeline.
export function OpenInquiry({ inquiry, company }: { inquiry: Inquiry; company: string }) {
  const router = useRouter();
  const [q, setQ] = useState(inquiry);
  return <InquiryDialog q={q} company={company} onClose={() => router.push("/portal/inquiries")} onUpdate={(p) => setQ((x) => ({ ...x, ...p }))} />;
}
