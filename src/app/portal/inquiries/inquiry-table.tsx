"use client";
import { useMemo, useState } from "react";
import { InquiryDialog, StageBadge, usd } from "@/components/inquiry-dialog";
import { CHANNEL_LABEL, SOURCE_LABEL, type Inquiry, type InquirySource } from "@/lib/types";

const SOURCES: ("all" | InquirySource)[] = ["all", "meta_ads", "meta_organic", "website", "direct", "unknown"];
// Filter buttons say where the person found you, in plain words.
const FILTER_LABEL: Record<"all" | InquirySource, string> = {
  all: "All inquiries", meta_ads: "From ads", meta_organic: "Facebook & Instagram (not ads)",
  website: "Website", direct: "Direct (not from ads)", unknown: "Other / Unknown",
};
// Second filter: the app they wrote in.
const APPS: [string, string][] = [
  ["all", "All apps"], ["whatsapp", "WhatsApp"], ["instagram_message", "Instagram"], ["facebook_message", "Messenger"],
  ["website_form", "Website form"], ["phone", "Phone"], ["email", "Email"], ["meta_lead_form", "Meta lead form"], ["other", "Other"],
];
const PAGE = 15;

function day(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Dar_es_Salaam" });
}

export function InquiryTable({ items, company, openId }: { items: Inquiry[]; company: string; openId?: string | null }) {
  const [rows, setRows] = useState(items);
  const [source, setSource] = useState<"all" | InquirySource>("all");
  const [app, setApp] = useState("all");
  const [all, setAll] = useState(false);
  const [sel, setSel] = useState<string | null>(openId ?? null);

  const byApp = useMemo(() => rows.filter((r) => app === "all" || r.channel === app), [rows, app]);
  const shown = useMemo(() => byApp.filter((r) => source === "all" || r.source === source), [byApp, source]);
  const appCount = (a: string) => rows.filter((r) => (source === "all" || r.source === source) && (a === "all" || r.channel === a)).length;
  const visible = all ? shown : shown.slice(0, PAGE);
  const q = rows.find((r) => r.id === sel) ?? null;

  return (
    <section aria-labelledby="list-h" className="flex flex-col gap-3">
      <h2 id="list-h" className="sr-only">Inquiry list</h2>
      <div className="flex flex-wrap items-start justify-between gap-2">
      <div role="group" aria-label="Where they found you" className="flex flex-wrap gap-1.5">
        {SOURCES.map((s) => {
          const on = s === source;
          const n = byApp.filter((r) => s === "all" || r.source === s).length;
          return (
            <button key={s} type="button" aria-pressed={on} onClick={() => { setSource(s); setAll(false); }}
              className={"h-8 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium " + (on ? "border-forest bg-forest text-white" : "border-field bg-white text-body hover:bg-[#F4F5F2]")}>
              {FILTER_LABEL[s]}
              <span className={"ml-1.5 tabular-nums " + (on ? "text-white/70" : "text-slate")}>{n}</span>
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-[13px] text-slate">
        <span>App</span>
        <select value={app} onChange={(e) => { setApp(e.target.value); setAll(false); }}
          className="h-8 rounded-control border border-field bg-white px-2 text-[13px] text-ink">
          {APPS.filter(([a]) => a === "all" || a === app || rows.some((r) => r.channel === a)).map(([a, l]) => <option key={a} value={a}>{l} ({appCount(a)})</option>)}
        </select>
      </label>
      </div>

      <div className="overflow-hidden rounded-card border border-line">
        <div aria-hidden="true" className="hidden gap-4 border-b border-line-soft bg-sidebar px-4 py-2.5 text-xs font-medium text-slate md:flex">
          <span className="flex-[1_1_200px]">Customer</span><span className="flex-[1_1_200px]">Interested in</span>
          <span className="flex-[0_0_190px]">Source</span><span className="flex-[0_0_64px]">Received</span><span className="flex-[0_0_104px]">Stage</span>
        </div>
        <ul>
          {visible.map((r, i) => (
            <li key={r.id} className={i ? "border-t border-line-soft" : ""}>
              <button type="button" onClick={() => setSel(r.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left hover:bg-[#FAFAF8]">
                <span className="flex min-w-0 flex-[1_1_200px] flex-col">
                  <span className={"inline-flex items-center gap-2 " + (r.status === "new" ? "font-semibold" : "")}>
                    {r.customer_name}{r.status === "new" && <span aria-label="New" className="size-[7px] rounded-full bg-[#5B7BE0]" />}
                  </span>
                  <span className="truncate text-xs text-slate">{[r.country, r.email ?? r.phone].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="min-w-0 flex-[1_1_200px] truncate">{r.interested_in ?? "—"}</span>
                <span className="flex flex-[0_0_190px] flex-col">
                  <span className="text-[13px] font-medium">{SOURCE_LABEL[r.source]}</span>
                  <span className="text-xs text-slate">via {CHANNEL_LABEL[r.channel] ?? r.channel}</span>
                </span>
                <span className="flex-[0_0_64px] whitespace-nowrap text-[13px] text-body">{day(r.received_at)}</span>
                <span className="flex flex-[0_0_104px] flex-col items-start gap-0.5"><StageBadge s={r.status} />{r.trip_value ? <span className="text-xs font-semibold tabular-nums">{usd(Number(r.trip_value))}</span> : null}</span>
              </button>
            </li>
          ))}
        </ul>
        {shown.length === 0 && (
          <div className="px-5 py-8 text-center text-slate">
            <span className="block font-semibold text-ink">{rows.length ? "No inquiries match these filters" : "No inquiries this month"}</span>
            {rows.length ? "Try another source, app or month." : "Try another month."}
          </div>
        )}
        {!all && shown.length > PAGE && (
          <div className="flex justify-center border-t border-line-soft px-4 py-2.5">
            <button type="button" onClick={() => setAll(true)} className="h-[34px] rounded-control border border-field bg-white px-3.5 text-[13px] font-medium hover:bg-[#F4F5F2]">Show all {shown.length}</button>
          </div>
        )}
      </div>

      {q && <InquiryDialog q={q} company={company} onClose={() => setSel(null)} onUpdate={(p) => setRows((rs) => rs.map((r) => (r.id === q.id ? { ...r, ...p } : r)))} />}
    </section>
  );
}
