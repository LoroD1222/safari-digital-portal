import { Badge } from "./ui";
import { Row, RowList } from "./blocks";
import { REQUEST_TONE } from "@/lib/status-tone";
import { CATEGORY_LABEL, REQUEST_LABEL, REQUEST_LABEL_ADMIN, type SupportRequest } from "@/lib/types";
import { ago } from "@/lib/dates";

export function RequestList({ items, hrefBase, admin, clientNames }: { items: SupportRequest[]; hrefBase: string; admin?: boolean; clientNames?: Record<string, string> }) {
  return (
    <RowList>
      {items.map((r) => {
        const unread = admin ? r.last_message_role === "client" && r.status !== "completed" : r.last_message_role === "admin" && r.status !== "completed";
        return (
          <Row key={r.id} href={`${hrefBase}/${r.id}`}>
            <span className={"size-2 flex-none rounded-full " + (unread ? "bg-[#E0A458]" : "bg-transparent")} aria-hidden="true" />
            <span className="flex min-w-0 flex-[1_1_240px] flex-col">
              <span className="truncate font-medium">{r.subject}</span>
              <span className="truncate text-xs text-slate">
                {[clientNames?.[r.client_id], CATEGORY_LABEL[r.category], `${unread ? (admin ? "Client replied" : "New reply") : "Updated"} ${ago(r.last_message_at)}`].filter(Boolean).join(" · ")}
              </span>
            </span>
            <Badge tone={REQUEST_TONE[r.status]}>{(admin ? REQUEST_LABEL_ADMIN : REQUEST_LABEL)[r.status]}</Badge>
          </Row>
        );
      })}
    </RowList>
  );
}
