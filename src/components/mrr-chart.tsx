import { formatMoney, type Currency } from "@/lib/types";

// Monthly recurring revenue, one column per month (single series, brand green).
export function MrrChart({ data, currency, note }: { data: { month: string; label: string; value: number }[]; currency: Currency; note?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const change = prev && prev.value > 0 ? Math.round(((last.value - prev.value) / prev.value) * 100) : null;
  const ticks = [max, max / 2, 0];
  return (
    <section aria-labelledby="mrr-h" className="flex flex-col gap-3 rounded-card border border-line px-5 py-4 shadow-[0_1px_2px_rgba(0,3,33,0.04)]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col">
          <h2 id="mrr-h" className="text-[15px] font-semibold">MRR · last 12 months</h2>
          <span className="text-[13px] text-slate">{note ?? "From active clients' monthly prices and start dates"}</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[22px] font-semibold tabular-nums tracking-[-0.02em]">{formatMoney(last?.value ?? 0, currency)}</span>
          {change !== null && <span className="text-xs text-slate">{change === 0 ? "Same as last month" : `${change > 0 ? "+" : ""}${change}% vs last month`}</span>}
        </div>
      </div>
      <figure className="m-0 flex flex-col gap-1.5">
        <div className="flex gap-2">
          <div aria-hidden="true" className="flex h-[140px] w-14 flex-col justify-between text-right text-[11px] tabular-nums text-slate">
            {ticks.map((t) => <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">{formatMoney(Math.round(t), currency)}</span>)}
          </div>
          <div className="relative flex h-[140px] flex-1 items-end gap-[2px] border-b border-line">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line-soft" />
            {data.map((d) => (
              <div key={d.month} className="group relative flex h-full flex-1 items-end justify-center">
                <div className="w-full max-w-[36px] rounded-t-[4px] bg-brand transition-colors group-hover:bg-forest" style={{ height: `${d.value ? Math.max(2, (d.value / max) * 100) : 0}%` }} />
                <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-badge bg-forest px-2 py-1 text-xs text-white group-hover:block">
                  {d.label}: {formatMoney(d.value, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div aria-hidden="true" className="ml-16 flex gap-[2px] text-[11px] text-slate">
          {data.map((d, i) => <span key={d.month} className="flex-1 text-center">{(data.length - 1 - i) % 2 === 0 ? d.label : ""}</span>)}
        </div>
        <table className="sr-only">
          <caption>MRR by month</caption>
          <thead><tr><th>Month</th><th>MRR</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.month}><td>{d.label}</td><td>{formatMoney(d.value, currency)}</td></tr>)}</tbody>
        </table>
      </figure>
    </section>
  );
}
