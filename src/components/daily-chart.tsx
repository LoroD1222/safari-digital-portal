// Inquiries per day for one month: one column per day, single series (brand green).
export function DailyChart({ title, days, note }: { title: string; days: { day: number; label: string; value: number; future?: boolean }[]; note?: string }) {
  const max = Math.max(...days.map((d) => d.value));
  // Whole-number axis: round the top up to 2, 4, 5, 10, 20…
  const top = max <= 2 ? 2 : max <= 4 ? 4 : max <= 5 ? 5 : Math.ceil(max / 5) * 5;
  const total = days.reduce((n, d) => n + d.value, 0);
  const busiest = max > 0 ? days.find((d) => d.value === max) : null;
  return (
    <section aria-labelledby="daily-h" className="flex flex-col gap-3 rounded-card border border-line px-5 py-4 shadow-[0_1px_2px_rgba(0,3,33,0.04)]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-col">
          <h2 id="daily-h" className="text-[15px] font-semibold">{title}</h2>
          <span className="text-[13px] text-slate">{note ?? "All sources"}</span>
        </div>
        {busiest && <span className="text-[13px] text-slate">Busiest day: <span className="font-medium text-ink">{busiest.label}</span> · {max} {max === 1 ? "inquiry" : "inquiries"}</span>}
      </div>
      <figure className="m-0 flex flex-col gap-1.5">
        <div className="flex gap-2">
          <div aria-hidden="true" className="flex h-[120px] w-6 flex-none flex-col justify-between text-right text-[11px] tabular-nums text-slate">
            <span>{top}</span><span>{top / 2}</span><span>0</span>
          </div>
          <div className="relative flex h-[120px] flex-1 items-end gap-[2px] border-b border-line">
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line-soft" />
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line-soft" />
            {days.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 items-end justify-center">
                <div className={"w-full max-w-[18px] rounded-t-[3px] transition-colors " + (d.value ? "bg-brand group-hover:bg-forest" : "")}
                  style={{ height: d.value ? `${Math.max(3, (d.value / top) * 100)}%` : 0 }} />
                {!d.future && (
                  <span className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-badge bg-forest px-2 py-1 text-xs text-white group-hover:block">
                    {d.label}: {d.value} {d.value === 1 ? "inquiry" : "inquiries"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        <div aria-hidden="true" className="ml-8 flex gap-[2px] text-[11px] text-slate">
          {days.map((d) => <span key={d.day} className="flex-1 text-center">{d.day === 1 || d.day % 5 === 0 ? d.day : ""}</span>)}
        </div>
        <table className="sr-only">
          <caption>{title}: {total} in total</caption>
          <thead><tr><th>Day</th><th>Inquiries</th></tr></thead>
          <tbody>{days.filter((d) => !d.future).map((d) => <tr key={d.day}><td>{d.label}</td><td>{d.value}</td></tr>)}</tbody>
        </table>
      </figure>
    </section>
  );
}

// Count items per day of the month, using Tanzania time (UTC+3).
export function perDay(monthStart: string, dates: string[], now = new Date()) {
  const [y, m] = monthStart.split("-").map(Number);
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const local = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
  const today = local(now.toISOString());
  const counts = new Map<string, number>();
  for (const d of dates) { const k = local(d); counts.set(k, (counts.get(k) ?? 0) + 1); }
  return Array.from({ length: daysIn }, (_, i) => {
    const key = `${monthStart.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`;
    const date = new Date(key + "T00:00:00Z");
    return { day: i + 1, label: date.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }), value: counts.get(key) ?? 0, future: key > today };
  });
}
