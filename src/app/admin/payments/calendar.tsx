import Link from "next/link";
import { formatMoney } from "@/lib/types";
import { monthGrid, shiftMonth, type PayEvent, type PayKind } from "@/lib/payments-calendar";
import { Icon } from "@/components/icons";

export const KIND: Record<PayKind, { label: string; chip: string; dot: string }> = {
  paid: { label: "Paid", chip: "bg-[#E3F4EA] text-[#1A6647]", dot: "bg-[#1A6647]" },
  due: { label: "Due", chip: "bg-[#E8EEFB] text-[#3450A6]", dot: "bg-[#5B7BE0]" },
  overdue: { label: "Overdue", chip: "bg-[#FBEAEA] text-[#9C2F2B]", dot: "bg-[#C2413B]" },
  draft: { label: "Needs approval", chip: "bg-[#FDF3E1] text-[#8A5A12]", dot: "bg-[#E0A458]" },
  expected: { label: "Expected, not invoiced yet", chip: "border border-dashed border-field bg-white text-body", dot: "border border-dashed border-slate bg-white" },
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const money = (e: PayEvent) => formatMoney(e.amount, e.currency as "USD" | "TZS");

export function PaymentsCalendar({ month, today, events }: { month: string; today: string; events: PayEvent[] }) {
  const label = new Date(month + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const inUsd = events.filter((e) => e.currency === "USD");
  const byDay = new Map<string, PayEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  const href = (m: string) => `/admin/payments?m=${m}`;
  return (
    <section aria-label={`Payments in ${label}`} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href(shiftMonth(month, -1))} scroll={false} aria-label="Previous month" className="flex size-9 items-center justify-center rounded-control border border-field bg-white hover:bg-[#F4F5F2]"><Icon name="chevronLeft" size={16} /></Link>
          <h2 className="min-w-[150px] text-center text-[17px] font-semibold">{label}</h2>
          <Link href={href(shiftMonth(month, 1))} scroll={false} aria-label="Next month" className="flex size-9 items-center justify-center rounded-control border border-field bg-white hover:bg-[#F4F5F2]"><Icon name="chevronRight" size={16} /></Link>
          {month !== today.slice(0, 7) && <Link href={href(today.slice(0, 7))} scroll={false} className="ml-1 text-[13px] font-medium text-brand">This month</Link>}
        </div>
        <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate">
          {(Object.keys(KIND) as PayKind[]).map((k) => <li key={k} className="flex items-center gap-1.5"><span className={`size-2.5 rounded-full ${KIND[k].dot}`} />{KIND[k].label}</li>)}
        </ul>
      </div>

      {/* Month grid (tablet and up) */}
      <div className="hidden overflow-hidden rounded-card border border-line bg-white md:block">
        <div className="grid grid-cols-7 border-b border-line bg-sidebar text-xs font-medium text-slate">
          {WEEKDAYS.map((d) => <div key={d} className="px-2.5 py-2">{d}</div>)}
        </div>
        {monthGrid(month).map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-line-soft last:border-b-0">
            {week.map((day, di) => {
              const list = day ? byDay.get(day) ?? [] : [];
              const isToday = day === today;
              return (
                <div key={di} className={`flex min-h-[104px] min-w-0 flex-col gap-1 border-r border-line-soft p-1.5 last:border-r-0 ${day ? "" : "bg-[#FAFAF8]"} ${day && di > 4 ? "bg-[#FCFCFA]" : ""}`}>
                  {day && <span className={`self-start px-1 text-xs tabular-nums ${isToday ? "rounded-full bg-forest px-2 font-semibold text-white" : "text-slate"}`}>{Number(day.slice(8))}</span>}
                  {list.map((e, i) => (
                    <Link key={i} href={e.href} title={`${e.client} · ${money(e)} · ${KIND[e.kind].label}${e.kind === "expected" ? "" : ` · ${e.label}`}`}
                      className={`flex min-w-0 flex-col rounded-[6px] px-1.5 py-1 text-[11px] leading-tight no-underline hover:brightness-95 ${KIND[e.kind].chip}`}>
                      <span className="truncate font-medium">{e.client}</span>
                      <span className="tabular-nums opacity-80">{money(e)}</span>
                    </Link>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Agenda (phones) */}
      <div className="flex flex-col gap-3 md:hidden">
        {events.length === 0 && <p className="rounded-card border border-line bg-white px-4 py-6 text-center text-[13px] text-slate">No payments in {label}.</p>}
        {[...byDay.entries()].map(([day, list]) => (
          <div key={day} className="flex flex-col gap-1.5">
            <h3 className={`text-[13px] font-semibold ${day === today ? "text-brand" : ""}`}>
              {new Date(day + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}{day === today ? " · Today" : ""}
            </h3>
            <ul className="flex flex-col overflow-hidden rounded-card border border-line bg-white">
              {list.map((e, i) => (
                <li key={i} className="border-b border-line-soft last:border-b-0">
                  <Link href={e.href} className="flex items-center gap-3 px-3.5 py-2.5 no-underline">
                    <span className={`size-2.5 shrink-0 rounded-full ${KIND[e.kind].dot}`} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[14px] font-medium text-ink">{e.client}</span>
                      <span className="text-xs text-slate">{KIND[e.kind].label}{e.kind === "expected" ? "" : ` · ${e.label}`}</span>
                    </span>
                    <span className="text-[14px] font-medium tabular-nums text-ink">{money(e)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {inUsd.length < events.length && <p className="text-xs text-slate">Totals are in USD; invoices in TZS show on the calendar but aren&apos;t added in.</p>}
    </section>
  );
}
