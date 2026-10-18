import type { ContentComment } from "@/lib/types";
import { fmtDateTime } from "@/lib/dates";

const TEXT: Record<ContentComment["kind"], (c: ContentComment, client: string) => string> = {
  sent: (c) => `Sent for approval (version ${c.version})`,
  approved: (_, who) => `${who} approved`,
  changes_requested: (_, who) => `${who} asked for changes`,
  revision: (c) => `New version uploaded (version ${c.version})`,
  comment: (c) => (c.author_role === "admin" ? "Safari Digital" : "Client") + " commented",
};

export function ContentHistory({ items, clientLabel }: { items: ContentComment[]; clientLabel: string }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="hist-h" className="flex flex-col gap-2">
      <h2 id="hist-h" className="text-[13px] font-semibold text-slate">History</h2>
      <ol className="flex flex-col">
        {items.map((c) => (
          <li key={c.id} className="flex gap-3 border-t border-line-soft py-2.5 first:border-t-0">
            <span className={"mt-[7px] size-1.5 flex-none rounded-full " + (c.kind === "changes_requested" ? "bg-[#C2413B]" : c.kind === "approved" ? "bg-mint" : "bg-[#C9CDD6]")} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{TEXT[c.kind](c, clientLabel)}</span>
              {c.body && <span className="whitespace-pre-wrap text-body">“{c.body}”</span>}
              <span className="text-xs text-slate">{fmtDateTime(c.created_at)}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
