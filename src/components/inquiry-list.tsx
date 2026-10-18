import { Badge } from "./ui";
import { Row, RowList } from "./blocks";
import { INQUIRY_TONE } from "@/lib/status-tone";
import { INQUIRY_LABEL, SOURCE_LABEL, type Inquiry } from "@/lib/types";
import { fmtDate } from "@/lib/dates";

export function InquiryList({ items, hrefBase, clientNames }: { items: Inquiry[]; hrefBase: string; clientNames?: Record<string, string> }) {
  return (
    <RowList>
      {items.map((q) => (
        <Row key={q.id} href={`${hrefBase}/${q.id}`}>
          <span className="flex min-w-0 flex-[1_1_220px] flex-col">
            <span className="font-medium">{q.customer_name}</span>
            <span className="truncate text-xs text-slate">
              {[clientNames?.[q.client_id], q.interested_in, q.country].filter(Boolean).join(" · ") || q.email || q.phone}
            </span>
          </span>
          <span className="w-44 text-[13px] text-body">{SOURCE_LABEL[q.source]}</span>
          <span className="w-16 text-[13px] text-slate">{fmtDate(q.received_at)}</span>
          <span className="w-24"><Badge tone={INQUIRY_TONE[q.status]}>{INQUIRY_LABEL[q.status]}</Badge></span>
        </Row>
      ))}
    </RowList>
  );
}

export function contactLinks(q: Pick<Inquiry, "email" | "phone" | "customer_name">) {
  const digits = q.phone?.replace(/[^\d]/g, "") ?? "";
  return {
    whatsapp: digits.length >= 8 ? `https://wa.me/${digits}` : null,
    email: q.email ? `mailto:${q.email}` : null,
    phone: q.phone ? `tel:${q.phone.replace(/\s/g, "")}` : null,
  };
}
