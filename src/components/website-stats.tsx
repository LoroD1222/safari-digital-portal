import type { WebsiteStats } from "@/lib/vercel";

const fmt = (n: number) => n.toLocaleString("en-US");
const regions = new Intl.DisplayNames(["en"], { type: "region" });
function countryName(code: string) {
  try { return code && code.length === 2 ? regions.of(code.toUpperCase()) ?? code : code || "Unknown"; } catch { return code; }
}
function dayLabel(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

type Extra = { label: string; value: number; delta?: string | null };

function delta(now: number, before: number | null | undefined, label: string) {
  if (before === null || before === undefined) return null;
  if (before === 0) return now > 0 ? `New this month` : null;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% vs ${label}`;
}

export function WebsiteStatsView({ stats, rangeLabel, previous, previousLabel, extra, between }: {
  stats: WebsiteStats; rangeLabel: string; previous?: Pick<WebsiteStats, "visitors" | "pageviews"> | null; previousLabel?: string; extra?: Extra; between?: React.ReactNode;
}) {
  const max = Math.max(1, ...stats.daily.map((d) => d.visitors));
  const best = stats.daily.reduce((a, d) => (d.visitors > (a?.visitors ?? -1) ? d : a), stats.daily[0]);
  const pageMax = Math.max(1, ...stats.pages.map((p) => p.pageviews));
  const countryTotal = Math.max(1, stats.visitors, stats.countries.reduce((s, c) => s + c.visitors, 0));

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-card border border-line shadow-[0_1px_2px_rgba(0,3,33,0.04)]">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] border-b border-line-soft">
          {([
            { label: "Visitors", value: stats.visitors, note: delta(stats.visitors, previous?.visitors, previousLabel ?? "last month") },
            { label: "Page views", value: stats.pageviews, note: delta(stats.pageviews, previous?.pageviews, previousLabel ?? "last month") },
            ...(extra ? [{ label: extra.label, value: extra.value, note: extra.delta ?? null }] : []),
          ]).map((x) => (
            <div key={x.label} className="-ml-px flex flex-col gap-0.5 border-l border-line-soft px-5 py-4">
              <span className="text-[13px] text-slate">{x.label}</span>
              <span className="text-[28px] font-semibold leading-tight tracking-[-0.03em] tabular-nums">{fmt(x.value)}</span>
              <span className="text-xs text-slate">{x.note ?? rangeLabel}</span>
            </div>
          ))}
        </div>
        {stats.daily.length > 0 && (
          <figure className="m-0 flex flex-col gap-2 px-5 pb-3 pt-4">
            <figcaption className="flex justify-between text-[13px] text-slate">
              <span>Visitors per day</span>
              {best && <span>Busiest: {dayLabel(best.date)} · {fmt(best.visitors)}</span>}
            </figcaption>
            <div aria-hidden="true" className="flex h-[110px] items-end gap-[2px]">
              {stats.daily.map((d) => (
                <div key={d.date} className="group relative flex h-full flex-1 items-end">
                  <div className="w-full rounded-t-[4px] bg-mint transition-colors group-hover:bg-brand" style={{ height: `${Math.max(2, (d.visitors / max) * 100)}%` }} />
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-badge bg-forest px-2 py-1 text-xs text-white group-hover:block">
                    {dayLabel(d.date)} · {fmt(d.visitors)} visitors
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-line-soft pt-1.5 text-xs text-slate">
              <span>{dayLabel(stats.daily[0].date)}</span><span>{dayLabel(stats.daily[stats.daily.length - 1].date)}</span>
            </div>
            <table className="sr-only">
              <caption>Visitors per day</caption>
              <thead><tr><th>Day</th><th>Visitors</th><th>Page views</th></tr></thead>
              <tbody>{stats.daily.map((d) => <tr key={d.date}><td>{dayLabel(d.date)}</td><td>{d.visitors}</td><td>{d.pageviews}</td></tr>)}</tbody>
            </table>
          </figure>
        )}
      </div>

      {between}
      <div className="flex flex-wrap gap-8">
        <section className="flex min-w-0 flex-[1_1_300px] flex-col">
          <h2 className="mb-1.5 text-[13px] font-semibold text-slate">Most visited pages</h2>
          {stats.pages.length === 0 ? <p className="border-t border-line-soft py-2.5 text-[13px] text-slate">No page views yet.</p> : stats.pages.map((p) => (
            <div key={p.path} className="flex items-center gap-3 border-t border-line-soft py-2">
              <span className="min-w-0 flex-[0_1_55%] truncate" title={p.path}>{p.path === "/" ? "Home" : p.path}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft"><span className="block h-full rounded-full bg-mint" style={{ width: `${(p.pageviews / pageMax) * 100}%` }} /></span>
              <span className="w-14 text-right tabular-nums text-body">{fmt(p.pageviews)}</span>
            </div>
          ))}
        </section>
        <section className="flex min-w-0 flex-[1_1_260px] flex-col">
          <h2 className="mb-1.5 text-[13px] font-semibold text-slate">Top visitor countries</h2>
          {stats.countries.length === 0 ? <p className="border-t border-line-soft py-2.5 text-[13px] text-slate">No visitors yet.</p> : stats.countries.map((c) => {
            const pct = Math.round((c.visitors / countryTotal) * 100);
            return (
              <div key={c.country} className="flex items-center gap-3 border-t border-line-soft py-2">
                <span className="w-32 truncate">{countryName(c.country)}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line-soft"><span className="block h-full rounded-full bg-mint" style={{ width: `${pct}%` }} /></span>
                <span className="w-10 text-right tabular-nums text-body">{pct}%</span>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
