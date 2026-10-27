"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { updateInquiryStatus } from "@/app/inquiry-actions";
import { Icon } from "@/components/icons";
import { CHANNEL_LABEL, INQUIRY_LABEL, SOURCE_LABEL, type Inquiry, type InquirySource, type InquiryStatus } from "@/lib/types";

const TONE: Record<InquiryStatus, [string, string, string]> = {
  new: ["#E8EEFB", "#3450A6", "#5B7BE0"],
  contacted: ["#FDF3E1", "#8A5A12", "#E0A458"],
  booked: ["#E3F4EA", "#1A6647", "#1A6647"],
  closed: ["#F1F2F4", "#4A4F63", "#8A8FA3"],
};
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
function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dar_es_Salaam" });
}

function StatusBadge({ s }: { s: InquiryStatus }) {
  const [bg, fg, dot] = TONE[s];
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-badge px-2 text-xs font-medium" style={{ background: bg, color: fg }}>
      <span className="size-1.5 rounded-full" style={{ background: dot }} />{INQUIRY_LABEL[s]}
    </span>
  );
}

export function InquiryTable({ items, company, openId }: { items: Inquiry[]; company: string; openId?: string | null }) {
  const [rows, setRows] = useState(items);
  const [source, setSource] = useState<"all" | InquirySource>("all");
  const [app, setApp] = useState("all");
  const [all, setAll] = useState(false);
  const [sel, setSel] = useState<string | null>(openId ?? null);
  const [pending, start] = useTransition();
  const closeRef = useRef<HTMLButtonElement>(null);

  const byApp = useMemo(() => rows.filter((r) => app === "all" || r.channel === app), [rows, app]);
  const shown = useMemo(() => byApp.filter((r) => source === "all" || r.source === source), [byApp, source]);
  const appCount = (a: string) => rows.filter((r) => (source === "all" || r.source === source) && (a === "all" || r.channel === a)).length;
  const visible = all ? shown : shown.slice(0, PAGE);
  const q = rows.find((r) => r.id === sel) ?? null;

  useEffect(() => {
    if (!q) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [q]);

  function setStatus(id: string, s: InquiryStatus) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: s } : r)));
    start(async () => { await updateInquiryStatus(id, s); });
  }

  const digits = q?.phone?.replace(/[^\d]/g, "") ?? "";

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
          <span className="flex-[0_0_190px]">Source</span><span className="flex-[0_0_64px]">Received</span><span className="flex-[0_0_96px]">Status</span>
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
                <span className="flex-[0_0_96px]"><StatusBadge s={r.status} /></span>
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

      {q && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,3,33,0.45)] p-6" onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="iq-h" className="flex max-h-full w-full max-w-[560px] flex-col gap-4 overflow-auto rounded-card bg-white px-6 py-[22px] shadow-[0_24px_64px_rgba(0,3,33,0.25)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 id="iq-h" className="text-[17px] font-semibold">{q.customer_name}</h2>
                <span className="text-[13px] text-slate">{[q.country, `received ${when(q.received_at)}`].filter(Boolean).join(" · ")}</span>
              </div>
              <button ref={closeRef} type="button" aria-label="Close" onClick={() => setSel(null)} className="inline-flex size-8 flex-none items-center justify-center rounded-control text-slate hover:bg-[#F4F5F2]"><Icon name="close" size={18} /></button>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="pb-2 text-[13px] font-semibold text-slate">Status</legend>
              <div className="inline-flex flex-wrap self-start rounded-control bg-[#F1F2F4] p-[3px]">
                {(Object.keys(INQUIRY_LABEL) as InquiryStatus[]).map((s) => (
                  <button key={s} type="button" aria-pressed={q.status === s} disabled={pending} onClick={() => setStatus(q.id, s)}
                    className={"inline-flex h-8 items-center gap-1.5 rounded-badge px-3 text-[13px] font-medium " + (q.status === s ? "bg-white shadow-[0_1px_2px_rgba(0,3,33,0.12)]" : "")}>
                    <span className="size-1.5 rounded-full" style={{ background: TONE[s][2] }} />{INQUIRY_LABEL[s]}
                  </button>
                ))}
              </div>
            </fieldset>
            <dl className="flex flex-col">
              {([
                ["Interested in", q.interested_in],
                ["Travel dates", q.travel_dates],
                ["Travellers", q.travellers],
                ["Email", q.email ? <a key="e" className="font-medium text-brand" href={`mailto:${q.email}`}>{q.email}</a> : "—"],
                ["Phone / WhatsApp", q.phone ? <span key="p">{q.phone}{digits.length >= 8 && <> · <a className="font-medium text-brand" href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer">Open WhatsApp</a></>}</span> : "—"],
                ["Source", SOURCE_LABEL[q.source] + (q.campaign ? ` · ${q.campaign}` : "")],
                ["Got in touch via", CHANNEL_LABEL[q.channel] ?? q.channel],
                ...(q.source === "unknown" ? [["Why Unknown", "No ad, website or referral details were recorded, so we don't guess."]] : []),
              ] as [string, React.ReactNode][]).map(([k, v]) => (
                <div key={k} className="flex flex-wrap gap-4 border-t border-line-soft py-2">
                  <dt className="flex-[0_0_130px] text-slate">{k}</dt>
                  <dd className="min-w-0 flex-[1_1_200px] [overflow-wrap:anywhere]">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            {q.message && <div className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-slate">Message</span><p className="whitespace-pre-wrap">{q.message}</p></div>}
            <span className="text-xs text-slate">Only {company} and Safari Digital can see this inquiry.</span>
          </div>
        </div>
      )}
    </section>
  );
}
