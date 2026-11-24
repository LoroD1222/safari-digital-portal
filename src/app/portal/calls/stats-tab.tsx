import Link from "next/link";
import { callStats, listStats, pct, REACHED, type CallContact, type CallList, type CallLog } from "@/lib/calls";

export function StatsTab({ range, now, lists, contacts, logs, names }: {
  range: number; now: number; lists: CallList[]; contacts: CallContact[]; logs: CallLog[]; names: Record<string, string>;
}) {
  const from = now - range * 864e5;
  const inRange = logs.filter((l) => Date.parse(l.created_at) >= from);
  const s = callStats(inRange, { from });
  const perList = listStats(lists, contacts, inRange).filter((l) => l.calls > 0).sort((a, b) => b.rate - a.rate);
  const people = Object.entries(inRange.reduce<Record<string, { calls: number; reached: number; interested: number }>>((acc, l) => {
    const k = l.user_id ?? "?";
    acc[k] ??= { calls: 0, reached: 0, interested: 0 };
    acc[k].calls++; if (REACHED.includes(l.outcome)) acc[k].reached++; if (l.outcome === "interested") acc[k].interested++;
    return acc;
  }, {})).sort((a, b) => b[1].calls - a[1].calls);
  const max = Math.max(0.0001, ...s.byHour.map((h) => h.rate));

  return (
    <div className="flex flex-col gap-5">
      <div role="group" aria-label="Period" className="flex gap-2">
        {[7, 28].map((d) => (
          <Link key={d} href={`/portal/calls?tab=stats${d === 28 ? "&range=28" : ""}`} scroll={false} aria-current={range === d ? "page" : undefined}
            className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium no-underline ${range === d ? "border-forest bg-forest text-white" : "border-field bg-white text-ink"}`}>
            {d === 7 ? "Last 7 days" : "Last 4 weeks"}
          </Link>
        ))}
      </div>

      <section aria-label="Totals" className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Tile label="Calls" value={String(s.calls)} />
        <Tile label="Pick-up rate" value={s.calls ? pct(s.rate) : "—"} note={`${s.reached} conversations`} />
        <Tile label="Interested" value={String(s.interested)} note={s.reached ? `${pct(s.interested / s.reached)} of conversations` : undefined} />
        <Tile label="Best time to call" value={s.best ? `${String(s.best.hour).padStart(2, "0")}:00` : "—"} note={s.best ? `${pct(s.best.rate)} pick up, ${s.best.calls} calls` : "Needs a few more calls"} />
      </section>

      <section aria-labelledby="hours-title" className="flex flex-col gap-3 rounded-card border border-line p-5">
        <div className="flex flex-col gap-0.5">
          <h2 id="hours-title" className="text-[15px] font-semibold">Pick-up rate by hour of the day</h2>
          <p className="text-[13px] text-slate">Share of calls where someone picked up and talked, Tanzania time. Hours with fewer than 3 calls are shown faintly.</p>
        </div>
        {s.calls === 0 ? <p className="py-8 text-center text-[13px] text-slate">No calls in this period yet.</p> : (
          <>
            <div className="relative flex h-[180px] items-end gap-1.5 border-b border-[#DADDE4] pt-5">
              {[0.5, 1].map((g) => <div key={g} aria-hidden="true" className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[#EEF0F2]" style={{ bottom: `${g * 100}%` }} />)}
              {s.byHour.map((h) => {
                const label = `${String(h.hour).padStart(2, "0")}:00 · ${h.calls} calls · ${h.calls ? pct(h.rate) : "no calls"} picked up`;
                const best = s.best?.hour === h.hour;
                return (
                  <div key={h.hour} className="group relative flex h-full flex-1 items-end justify-center" tabIndex={0} aria-label={label}>
                    <div className="w-full max-w-[28px] rounded-t-[4px] bg-brand transition-opacity group-hover:opacity-80"
                      style={{ height: h.calls ? `${Math.max(2, (h.rate / max) * 100)}%` : "0", opacity: h.calls >= 3 ? 1 : 0.35 }} />
                    {best && <span className="absolute text-[11px] font-semibold text-ink" style={{ bottom: `calc(${(h.rate / max) * 100}% + 4px)` }}>{pct(h.rate)}</span>}
                    <span role="tooltip" className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-control bg-ink px-2 py-1 text-[11px] text-white group-hover:block group-focus:block">{label}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-1.5 text-center text-[11px] text-slate">
              {s.byHour.map((h) => <span key={h.hour} className="flex-1 tabular-nums">{String(h.hour).padStart(2, "0")}<span className="block text-[10px]">{h.calls}</span></span>)}
            </div>
          </>
        )}
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section aria-labelledby="lists-title" className="overflow-hidden rounded-card border border-line">
          <div className="border-b border-line px-4 py-3">
            <h2 id="lists-title" className="text-[15px] font-semibold">Which lists pick up</h2>
            <p className="text-[13px] text-slate">Worth buying or building more of the lists at the top.</p>
          </div>
          {perList.length ? (
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-line text-left text-slate"><th className="px-4 py-2 font-medium">List</th><th className="px-2 py-2 font-medium">Calls</th><th className="px-2 py-2 font-medium">Pick-up</th><th className="px-4 py-2 font-medium">Interested</th></tr></thead>
              <tbody>{perList.map((l) => (
                <tr key={l.id} className="border-b border-[#F1F2F4] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{l.name}</td><td className="px-2 py-2.5 tabular-nums">{l.calls}</td>
                  <td className="px-2 py-2.5 tabular-nums">{pct(l.rate)}</td><td className="px-4 py-2.5 tabular-nums">{l.interested}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="px-4 py-6 text-[13px] text-slate">No calls in this period yet.</p>}
        </section>

        <section aria-labelledby="people-title" className="overflow-hidden rounded-card border border-line">
          <div className="border-b border-line px-4 py-3"><h2 id="people-title" className="text-[15px] font-semibold">Who called</h2></div>
          {people.length ? (
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-line text-left text-slate"><th className="px-4 py-2 font-medium">Person</th><th className="px-2 py-2 font-medium">Calls</th><th className="px-2 py-2 font-medium">Pick-up</th><th className="px-4 py-2 font-medium">Interested</th></tr></thead>
              <tbody>{people.map(([id, v]) => (
                <tr key={id} className="border-b border-[#F1F2F4] last:border-0">
                  <td className="px-4 py-2.5 font-medium">{names[id] ?? "Someone"}</td><td className="px-2 py-2.5 tabular-nums">{v.calls}</td>
                  <td className="px-2 py-2.5 tabular-nums">{pct(v.reached / v.calls)}</td><td className="px-4 py-2.5 tabular-nums">{v.interested}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <p className="px-4 py-6 text-[13px] text-slate">No calls in this period yet.</p>}
        </section>
      </div>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-line px-[18px] py-4">
      <span className="text-[13px] text-slate">{label}</span>
      <span className="text-[28px] font-semibold leading-tight tracking-[-0.03em] tabular-nums">{value}</span>
      {note && <span className="text-xs text-slate">{note}</span>}
    </div>
  );
}
