import Link from "next/link";
import { BACKLINK_STATUS, backlinkMonths, type Backlink, type SeoData } from "@/lib/seo";

// The client's backlinks, one list per SEO plan month (no costs).
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (d: string) => `${LONG[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const TONE: Record<Backlink["status"], string> = { planned: "bg-[#FDF3E1] text-[#8A5A12]", live: "bg-[#E3F4EA] text-[#1A6647]", lost: "bg-[#FBEAEA] text-[#9C2F2B]" };

export function SeoBacklinks({ data, month, base, today }: { data: SeoData; month: string | null; base: string; today: string }) {
  const months = backlinkMonths(data.plan, data.backlinks);
  if (!months.length) return <p className="rounded-card border border-line px-4 py-3.5 text-[14px] text-slate">Your backlinks will appear here month by month as we build them.</p>;
  const now = today.slice(0, 7) + "-01";
  const sel = months.find((m) => m.month === month)?.month ?? months.find((m) => m.month === now)?.month ?? months.filter((m) => m.month <= now).at(-1)?.month ?? months[0].month;
  const m = months.find((x) => x.month === sel)!;
  const list = data.backlinks.filter((l) => l.month === sel && l.status !== "lost");
  const live = list.filter((l) => l.status === "live").length;
  const allLive = data.backlinks.filter((l) => l.status === "live").length;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] text-body">Backlinks are links to your website from other trusted websites. Google sees them as recommendations, which helps you rank higher. <strong className="font-semibold text-ink">{allLive} live so far.</strong></p>
      <nav aria-label="Plan month" className="flex flex-wrap gap-2">
        {months.map((x) => (
          <Link key={x.month} href={`${base}&month=${x.month}`} scroll={false} aria-current={x.month === sel ? "page" : undefined}
            className={`flex flex-col rounded-control border px-3 py-1.5 no-underline ${x.month === sel ? "border-forest bg-[#E3F4EA]" : "border-field bg-white hover:bg-[#F4F5F2]"}`}>
            <span className="text-[13px] font-semibold text-ink">{x.no ? `Month ${x.no}` : monthLabel(x.month)}</span>
            <span className="text-xs text-slate">{monthLabel(x.month)}</span>
          </Link>
        ))}
      </nav>
      <section aria-labelledby="bl-h" className="flex flex-col gap-3 rounded-card border border-line px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="bl-h" className="text-[15px] font-semibold">{m.no ? `Month ${m.no}${m.title ? ` · ${m.title}` : ""}` : monthLabel(m.month)}</h2>
          <p className="text-[13px] text-slate">{monthLabel(m.month)} · {list.length} {list.length === 1 ? "backlink" : "backlinks"}, {live} live</p>
        </div>
        {list.length === 0 ? <p className="text-[13px] text-slate">{sel > now ? "This month hasn't started yet." : "We're working on this month's backlinks. They'll show here as they go live."}</p> : (
          <ul className="flex flex-col border-t border-line-soft">
            {list.map((l) => (
              <li key={l.id} className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-b-0">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[14px] font-medium">{l.site}{l.authority !== null && <span className="ml-1.5 text-xs font-normal text-slate" title="Domain rating: how strong the website is, 0–100">DR {l.authority}</span>}</span>
                  {l.url && l.status === "live" && <a href={l.url} target="_blank" rel="noopener noreferrer" className="truncate text-xs text-brand">See the link ↗</a>}
                  {l.anchor && <span className="truncate text-xs text-slate">Linked text: {l.anchor}</span>}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[l.status]}`}>{BACKLINK_STATUS[l.status]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
