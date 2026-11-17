import type { ReactNode } from "react";
import { pctChange, positionMove, seoPeriods, type SeoData, type SeoTop } from "@/lib/seo";

// The client's SEO results: Google clicks and positions from Search Console, tracked keywords,
// top searches and pages, and what Safari Digital did each month. Used on the portal and in admin.

const n = (v: number) => new Intl.NumberFormat("en-US").format(Math.round(v));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const shortDate = (d: string) => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
const monthName = (d: string) => `${LONG[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const path = (url: string) => { try { const u = new URL(url); return (u.pathname + u.search) || "/"; } catch { return url; } };

function Change({ pct, good = "up" }: { pct: number | null; good?: "up" | "down" }) {
  if (pct === null) return null;
  if (pct === 0) return <span className="text-xs text-slate">Same as the 28 days before</span>;
  const better = good === "up" ? pct > 0 : pct < 0;
  return <span className={`text-xs font-medium ${better ? "text-forest" : "text-danger-text"}`}>{pct > 0 ? "▲" : "▼"} {Math.abs(pct)}% vs the 28 days before</span>;
}

function Move({ by }: { by: number | null }) {
  if (by === null) return <span className="text-slate">–</span>;
  if (Math.abs(by) < 0.5) return <span className="text-slate">same</span>;
  return <span className={by > 0 ? "font-medium text-forest" : "font-medium text-danger-text"}>{by > 0 ? "▲" : "▼"} {Math.abs(by).toFixed(1)}</span>;
}

function Tile({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line px-[18px] py-4">
      <span className="text-[13px] text-slate">{label}</span>
      <span className="text-[28px] font-semibold leading-tight tracking-[-0.03em] tabular-nums">{value}</span>
      {children}
    </div>
  );
}

function Card({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-card border border-line px-5 py-4">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-[15px] font-semibold">{title}</h2>
        {note && <p className="text-[13px] text-slate">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function ClicksChart({ days }: { days: { day: string; clicks: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.clicks));
  const top = max <= 5 ? 5 : max <= 10 ? 10 : Math.ceil(max / 10) * 10;
  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <div className="flex gap-2">
        <div aria-hidden className="flex h-[120px] w-7 flex-none flex-col justify-between text-right text-[11px] tabular-nums text-slate"><span>{top}</span><span>{top / 2}</span><span>0</span></div>
        <div className="relative flex h-[120px] flex-1 items-end gap-[2px] border-b border-line">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line-soft" />
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line-soft" />
          {days.map((d) => (
            <div key={d.day} className="group relative flex h-full flex-1 items-end justify-center">
              <div className={"w-full max-w-[18px] rounded-t-[3px] " + (d.clicks ? "bg-brand group-hover:bg-forest" : "")} style={{ height: d.clicks ? `${Math.max(3, (d.clicks / top) * 100)}%` : 0 }} />
              <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-badge bg-forest px-2 py-1 text-xs text-white group-hover:block">{shortDate(d.day)}: {d.clicks} {d.clicks === 1 ? "click" : "clicks"}</span>
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden className="ml-9 flex justify-between text-[11px] text-slate"><span>{days[0] && shortDate(days[0].day)}</span><span>{days.at(-1) && shortDate(days.at(-1)!.day)}</span></div>
      <table className="sr-only"><caption>Clicks from Google per day</caption><tbody>{days.map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.clicks}</td></tr>)}</tbody></table>
    </figure>
  );
}

function TopList({ rows, kind, empty }: { rows: SeoTop[]; kind: "query" | "page"; empty: string }) {
  if (!rows.length) return <p className="text-[13px] text-slate">{empty}</p>;
  const first = rows.slice(0, 10), rest = rows.slice(10);
  const row = (r: SeoTop) => (
    <li key={r.key} className="flex items-center gap-3 border-t border-line-soft py-2 first:border-t-0">
      <span className="min-w-0 flex-1 truncate text-[14px]" title={r.key}>
        {kind === "page" ? <a href={r.key} target="_blank" rel="noopener noreferrer" className="text-ink no-underline hover:underline">{path(r.key)}</a> : r.key}
      </span>
      <span className="w-14 text-right text-[13px] tabular-nums"><span className="font-medium">{n(r.clicks)}</span></span>
      <span className="hidden w-20 text-right text-[13px] tabular-nums text-slate sm:inline">{n(r.impressions)}</span>
      <span className="w-12 text-right text-[13px] tabular-nums text-slate">{r.position?.toFixed(1) ?? "–"}</span>
    </li>
  );
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-slate">
        <span className="flex-1">{kind === "page" ? "Page" : "Search"}</span><span className="w-14 text-right">Clicks</span>
        <span className="hidden w-20 text-right sm:inline">Seen</span><span className="w-12 text-right">Pos.</span>
      </div>
      <ul className="border-t border-line">{first.map(row)}</ul>
      {rest.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer list-none py-2 text-[13px] font-medium text-brand">Show {rest.length} more</summary>
          <ul>{rest.map(row)}</ul>
        </details>
      )}
    </div>
  );
}

export function SeoReport({ data, connected, site }: { data: SeoData; connected: boolean; site?: string | null }) {
  const p = seoPeriods(data.days);
  const queries = data.top.filter((t) => t.kind === "query");
  const pages = data.top.filter((t) => t.kind === "page");
  const hasData = data.days.length > 0;
  const period = p.from && p.to ? `${shortDate(p.from)} – ${shortDate(p.to)}` : "Last 28 days";

  return (
    <div className="flex flex-col gap-5">
      {!hasData && (
        <div className="rounded-card border border-[#F2DDB0] bg-[#FFF7E8] px-4 py-3.5 text-[14px] text-body">
          {connected
            ? <>Your Google Search Console is connected{site ? <> ({site.replace(/^sc-domain:/, "")})</> : null}. Your first results appear here within a day.</>
            : <>We&apos;re connecting your Google Search Console. Your Google results will appear here once it&apos;s done.</>}
        </div>
      )}

      {hasData && (
        <>
          <section aria-label="Results from Google" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Clicks from Google" value={n(p.current.clicks)}><Change pct={pctChange(p.current.clicks, p.previous?.clicks)} /></Tile>
            <Tile label="Times seen on Google" value={n(p.current.impressions)}><Change pct={pctChange(p.current.impressions, p.previous?.impressions)} /></Tile>
            <Tile label="Average position" value={p.current.position?.toFixed(1) ?? "–"}>
              {p.previous?.position != null && p.current.position != null && <span className="text-xs text-slate">Was {p.previous.position.toFixed(1)}. Lower is better</span>}
            </Tile>
            <Tile label="Click rate" value={p.current.ctr !== null ? `${(p.current.ctr * 100).toFixed(1)}%` : "–"}>
              <span className="text-xs text-slate">Of people who saw you</span>
            </Tile>
          </section>
          <Card id="seo-clicks" title="Clicks from Google" note={`${period} · from Google Search Console, about 3 days behind`}>
            <ClicksChart days={p.cur} />
          </Card>
        </>
      )}

      <Card id="seo-kw" title="Keywords we're tracking" note="Your average Google position for each search over the last 7 days. Position 1 is the top result; 1–10 is the first page.">
        {data.keywords.length === 0 ? <p className="text-[13px] text-slate">We&apos;ll add the searches we&apos;re working on here.</p> : (
          <div className="flex flex-col">
            <div className="flex items-center gap-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-slate">
              <span className="flex-1">Search</span><span className="w-16 text-right">Position</span><span className="w-16 text-right">Change</span><span className="hidden w-14 text-right sm:inline">Clicks</span>
            </div>
            <ul className="border-t border-line">
              {data.keywords.map((k) => (
                <li key={k.id} className="flex items-center gap-3 border-t border-line-soft py-2 first:border-t-0">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-medium">{k.keyword}</span>
                    {k.best_page && <span className="truncate text-xs text-slate">{path(k.best_page)}</span>}
                  </span>
                  <span className="w-16 text-right text-[14px] tabular-nums">
                    {k.position === null ? <span className="text-xs text-slate">{k.checked_at ? "Not in top 100 yet" : "Checking"}</span>
                      : <span className={k.position <= 10 ? "font-semibold text-forest" : "font-medium"}>{k.position.toFixed(1)}</span>}
                  </span>
                  <span className="w-16 text-right text-[13px] tabular-nums"><Move by={positionMove(k.position, k.prev_position)} /></span>
                  <span className="hidden w-14 text-right text-[13px] tabular-nums text-slate sm:inline">{k.clicks ?? "–"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {hasData && (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <Card id="seo-q" title="What people searched" note={`${period} · searches where you showed up on Google`}>
            <TopList rows={queries} kind="query" empty="No searches yet." />
          </Card>
          <Card id="seo-p" title="Your top pages on Google" note={period}>
            <TopList rows={pages} kind="page" empty="No pages yet." />
          </Card>
        </div>
      )}

      <Card id="seo-work" title="What we did" note="The SEO work Safari Digital did on your website each month.">
        {data.work.length === 0 ? <p className="text-[13px] text-slate">Our first monthly update will appear here.</p> : (
          <ol className="flex flex-col">
            {data.work.map((w) => (
              <li key={w.id} className="flex flex-col gap-1 border-t border-line-soft py-3 first:border-t-0 first:pt-0">
                <h3 className="text-[14px] font-semibold">{monthName(w.month)}</h3>
                <p className="whitespace-pre-line text-[14px] text-body">{w.body}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
