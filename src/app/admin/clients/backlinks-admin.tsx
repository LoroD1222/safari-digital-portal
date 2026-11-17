"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import { formatMoney } from "@/lib/types";
import { BACKLINK_STATUS, type Backlink } from "@/lib/seo";
import { deleteBacklink, saveBacklink, setBacklinkStatus, type BacklinkInput } from "./seo-actions";

type Month = { month: string; no: number | null; title: string; budget: number };
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (d: string) => `${LONG[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
const STATUS_TONE: Record<Backlink["status"], string> = { planned: "bg-[#FDF3E1] text-[#8A5A12]", live: "bg-[#E3F4EA] text-[#1A6647]", lost: "bg-[#FBEAEA] text-[#9C2F2B]" };

// Backlinks per SEO plan month: what we built, where, and what it cost against the month's backlinks budget.
export function BacklinksAdmin({ clientId, months, links, currency, initial }: { clientId: string; months: Month[]; links: Backlink[]; currency: "USD" | "TZS"; initial: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [month, setMonth] = useState(initial);
  const empty: BacklinkInput = { month: initial, site: "", url: "", anchor: "", authority: "", cost: "", status: "planned" };
  const [form, setForm] = useState<BacklinkInput>(empty);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const m = months.find((x) => x.month === month);
  const list = links.filter((l) => l.month === month);
  const spent = list.reduce((n, l) => n + (l.cost ?? 0), 0);
  const live = list.filter((l) => l.status === "live").length;

  const add = () => start(async () => {
    setMsg(null);
    const r = await saveBacklink(clientId, { ...form, month });
    if (r.ok) { setForm({ ...empty, month }); setMsg({ ok: true, text: r.message ?? "Added." }); } else setMsg({ ok: false, text: r.error });
    router.refresh();
  });

  if (!months.length) {
    return <p className="rounded-card border border-line px-4 py-3.5 text-[14px] text-slate">Set the SEO plan (start month and number of months) on the Overview tab first. Each plan month gets its own backlinks list.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Plan month" className="flex flex-wrap gap-2">
        {months.map((x) => (
          <button key={x.month} role="tab" aria-selected={x.month === month} type="button" onClick={() => { setMonth(x.month); setMsg(null); }}
            className={`flex flex-col items-start rounded-control border px-3 py-1.5 text-left ${x.month === month ? "border-forest bg-[#E3F4EA]" : "border-field bg-white hover:bg-[#F4F5F2]"}`}>
            <span className="text-[13px] font-semibold">{x.no ? `Month ${x.no}` : monthLabel(x.month)}</span>
            <span className="text-xs text-slate">{x.no ? monthLabel(x.month) : "Outside the plan"} · {links.filter((l) => l.month === x.month).length} links</span>
          </button>
        ))}
      </div>

      <section className="flex flex-col gap-3 rounded-card border border-line px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[15px] font-semibold">{m?.no ? `Month ${m.no}${m.title ? ` · ${m.title}` : ""}` : monthLabel(month)}</h2>
            <p className="text-[13px] text-slate">{monthLabel(month)} · {list.length} {list.length === 1 ? "backlink" : "backlinks"}, {live} live</p>
          </div>
          <div className="flex flex-col items-end text-[13px]">
            <span className="text-slate">Spent / backlinks budget</span>
            <span className={`font-semibold tabular-nums ${m && m.budget > 0 && spent > m.budget ? "text-danger-text" : "text-ink"}`}>{formatMoney(spent, currency)} / {formatMoney(m?.budget ?? 0, currency)}</span>
          </div>
        </div>

        {list.length > 0 && (
          <ul className="flex flex-col border-t border-line-soft">
            {list.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line-soft py-2.5">
                <span className="flex min-w-[200px] flex-1 flex-col">
                  <span className="text-[14px] font-medium">{l.site}{l.authority !== null && <span className="ml-1.5 text-xs font-normal text-slate">DR {l.authority}</span>}</span>
                  {l.url && <a href={l.url} target="_blank" rel="noopener noreferrer" className="truncate text-xs text-brand">{l.url}</a>}
                  {l.anchor && <span className="text-xs text-slate">Anchor: {l.anchor}</span>}
                </span>
                <span className="w-28 text-right text-[13px] tabular-nums text-slate">{l.cost !== null ? formatMoney(l.cost, currency) : "–"}</span>
                <select aria-label={`Status of ${l.site}`} value={l.status} disabled={pending}
                  onChange={(e) => start(async () => { await setBacklinkStatus(clientId, l.id, e.target.value as Backlink["status"]); router.refresh(); })}
                  className={`h-8 rounded-full border-0 px-2.5 text-xs font-medium ${STATUS_TONE[l.status]}`}>
                  {(Object.keys(BACKLINK_STATUS) as Backlink["status"][]).map((s) => <option key={s} value={s}>{BACKLINK_STATUS[s]}</option>)}
                </select>
                <button type="button" disabled={pending} onClick={() => start(async () => { await deleteBacklink(clientId, l.id); router.refresh(); })}
                  className="h-8 rounded-control px-2 text-[13px] font-medium text-danger-text hover:bg-[#FBEAEA]" aria-label={`Remove ${l.site}`}>Remove</button>
              </li>
            ))}
          </ul>
        )}

        <fieldset className="flex flex-col gap-2.5 rounded-control bg-sidebar px-3.5 py-3">
          <legend className="sr-only">Add a backlink</legend>
          <span className="text-[13px] font-semibold">Add a backlink</span>
          <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr]">
            <Input aria-label="Website" placeholder="Website, e.g. safaribookings.com" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
            <Input aria-label="Link to the page" placeholder="https://… (the page with the link)" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1.4fr_90px_130px_140px]">
            <Input className="col-span-2 sm:col-span-1" aria-label="Anchor text" placeholder="Anchor text, e.g. Serengeti safari" value={form.anchor} onChange={(e) => setForm({ ...form, anchor: e.target.value })} />
            <Input aria-label="Domain rating" inputMode="numeric" placeholder="DR" value={form.authority} onChange={(e) => setForm({ ...form, authority: e.target.value })} />
            <Input aria-label="Cost" inputMode="decimal" placeholder={`Cost (${currency})`} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            <Select aria-label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {(Object.keys(BACKLINK_STATUS) as Backlink["status"][]).map((s) => <option key={s} value={s}>{BACKLINK_STATUS[s]}</option>)}
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Button className="h-9" disabled={pending || !form.site.trim()} onClick={add}>Add backlink</Button>
            {msg && <span role="status" className={`text-[13px] ${msg.ok ? "text-forest" : "text-danger-text"}`}>{msg.text}</span>}
          </div>
        </fieldset>
      </section>
      <p className="text-xs text-slate">The client sees each month&apos;s backlinks on their SEO page (site, link and status), not the costs.</p>
    </div>
  );
}
