import Link from "next/link";
import { Badge } from "./ui";
import { Media } from "./media";
import { CONTENT_TONE } from "@/lib/status-tone";
import { CONTENT_LABEL, KIND_LABEL, PLATFORM_LABEL, type ContentItem } from "@/lib/types";
import { fmtDate } from "@/lib/dates";

export function ContentGrid({ items, urls, hrefBase, clientNames, statusLabel }: {
  items: ContentItem[]; urls: Record<string, string>; hrefBase: string; clientNames?: Record<string, string>; statusLabel?: Partial<Record<string, string>>;
}) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-4">
      {items.map((it) => (
        <li key={it.id}>
          <Link href={`${hrefBase}/${it.id}`} className="group flex flex-col overflow-hidden rounded-card border border-line text-ink no-underline hover:border-[#C9CDD6]">
            <div className="relative aspect-[4/5] overflow-hidden bg-sidebar">
              <Media url={urls[it.id] ?? null} type={it.media_type} alt={it.title} />
              <span className="absolute left-2 top-2"><Badge tone={CONTENT_TONE[it.status]}>{statusLabel?.[it.status] ?? CONTENT_LABEL[it.status]}</Badge></span>
            </div>
            <div className="flex flex-col gap-0.5 px-3 py-2.5">
              <span className="truncate font-medium group-hover:text-brand">{it.title}</span>
              <span className="truncate text-xs text-slate">
                {[clientNames?.[it.client_id], KIND_LABEL[it.kind], PLATFORM_LABEL[it.platform], it.scheduled_for ? fmtDate(it.scheduled_for) : null].filter(Boolean).join(" · ")}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
