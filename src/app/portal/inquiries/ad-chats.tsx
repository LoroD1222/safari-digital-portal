"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { Alert, Input, Select } from "@/components/ui";
import { addAdChats, type AdChatRow } from "./actions";

const WHERE: { value: AdChatRow["where"]; label: string }[] = [
  { value: "whatsapp_ad", label: "WhatsApp" }, { value: "instagram_ad", label: "Instagram" }, { value: "facebook_ad", label: "Messenger" },
];
const blank = (where: AdChatRow["where"] = "whatsapp_ad"): AdChatRow => ({ name: "", where, phone: "", asked: "" });

// The banner under the stats: how many chats the ads started, how many are in the list, and a quick way to add the rest.
export function AdChatsBanner({ chats, added, monthName, current }: { chats: number; added: number; monthName: string; current: boolean }) {
  const missing = Math.max(0, chats - added);
  return (
    <div className={"flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border px-4 py-3 " + (missing ? "border-[#F1E2C3] bg-[#FFFAF0]" : "border-line")}>
      <span className="flex size-9 flex-none items-center justify-center rounded-full bg-[#E3F4EA] text-brand"><Icon name="chat" size={18} /></span>
      <span className="min-w-[220px] flex-1 text-[13px] text-body">
        <span className="font-semibold text-ink">{chats} {chats === 1 ? "chat" : "chats"} started from your ads</span> in {monthName}, on WhatsApp, Instagram and Messenger.
        {" "}{missing
          ? <><span className="font-semibold text-[#8A5A12]">{added} {added === 1 ? "is" : "are"} in your list, {missing} still to add.</span> Meta only shares the number, not who they are, so add their names here to follow them up and count bookings.</>
          : "All of them are in your list."}
      </span>
      {missing > 0 && current && <AddAdChats missing={missing} />}
    </div>
  );
}

export function AddAdChats({ missing }: { missing: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex h-[34px] items-center gap-1.5 rounded-control bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-hover">
        <Icon name="plus" size={16} />Add chats from ads
      </button>
      {open && <AdChatsDialog missing={missing} onClose={() => setOpen(false)} />}
    </>
  );
}

function AdChatsDialog({ missing, onClose }: { missing: number; onClose: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<AdChatRow[]>(() => Array.from({ length: Math.min(Math.max(missing, 1), 5) }, () => blank()));
  const [day, setDay] = useState(() => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10));
  const [today] = useState(day);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const set = (i: number, p: Partial<AdChatRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const filled = rows.filter((r) => r.name.trim()).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,3,33,0.45)] p-4 sm:p-6" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ac-h" className="flex max-h-full w-full max-w-[720px] flex-col gap-4 overflow-auto rounded-card bg-white px-5 py-5 shadow-[0_24px_64px_rgba(0,3,33,0.25)] sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="ac-h" className="text-[17px] font-semibold">Add chats from ads</h2>
            <span className="text-[13px] text-slate">A name is enough. Each one goes into Inquiries and the Pipeline as a new inquiry from your ads.</span>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-8 flex-none items-center justify-center rounded-control text-slate hover:bg-[#F4F5F2]"><Icon name="close" size={18} /></button>
        </div>

        {saved !== null ? (
          <div className="flex flex-col gap-4">
            <Alert tone="success">{saved} {saved === 1 ? "chat is" : "chats are"} now in your inquiries.</Alert>
            <div className="flex justify-end"><button type="button" onClick={onClose} className="h-10 rounded-control bg-brand px-4 font-semibold text-white hover:bg-brand-hover">Done</button></div>
          </div>
        ) : (
          <>
            {error && <Alert>{error}</Alert>}
            <div className="hidden grid-cols-[minmax(0,1.3fr)_130px_minmax(0,1fr)_minmax(0,1fr)_32px] gap-2 px-0.5 text-xs font-medium text-slate sm:grid">
              <span>Name</span><span>Where</span><span>WhatsApp / phone</span><span>Asked about</span><span />
            </div>
            <ul className="flex flex-col gap-3 sm:gap-2">
              {rows.map((r, i) => (
                <li key={i} className="grid grid-cols-2 gap-2 rounded-control border border-line-soft p-2.5 sm:grid-cols-[minmax(0,1.3fr)_130px_minmax(0,1fr)_minmax(0,1fr)_32px] sm:border-0 sm:p-0">
                  <Input ref={i === 0 ? first : undefined} aria-label={`Name ${i + 1}`} placeholder="Name" value={r.name} onChange={(e) => set(i, { name: e.target.value })} className="col-span-2 sm:col-span-1" />
                  <Select aria-label={`Where ${i + 1}`} value={r.where} onChange={(e) => set(i, { where: e.target.value as AdChatRow["where"] })}>
                    {WHERE.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                  </Select>
                  <Input aria-label={`Phone ${i + 1}`} type="tel" placeholder={r.where === "whatsapp_ad" ? "+44…" : "optional"} value={r.phone} onChange={(e) => set(i, { phone: e.target.value })} />
                  <Input aria-label={`Asked about ${i + 1}`} placeholder="optional" value={r.asked} onChange={(e) => set(i, { asked: e.target.value })} className="col-span-2 sm:col-span-1" />
                  <button type="button" aria-label={`Remove row ${i + 1}`} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                    className="col-span-2 inline-flex h-10 items-center justify-center rounded-control text-slate hover:bg-[#F4F5F2] disabled:opacity-30 sm:col-span-1"><Icon name="close" size={16} /></button>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => setRows((rs) => [...rs, blank(rs[rs.length - 1]?.where)])} disabled={rows.length >= 50}
                className="inline-flex h-9 items-center gap-1.5 rounded-control border border-dashed border-[#B7BCC8] px-3 text-[13px] font-semibold hover:bg-[#F4F5F2]"><Icon name="plus" size={15} />Another</button>
              <label className="ml-auto inline-flex items-center gap-2 whitespace-nowrap text-[13px] text-slate">Chatted on
                <Input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className="h-9 w-[150px]" /></label>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="h-10 rounded-control px-4 font-medium text-slate hover:text-ink">Cancel</button>
              <button type="button" disabled={pending || !filled}
                onClick={() => start(async () => { setError(null); const r = await addAdChats(rows, day); if (!r.ok) setError(r.error); else { setSaved(r.count); router.refresh(); } })}
                className="h-10 rounded-control bg-brand px-4 font-semibold text-white hover:bg-brand-hover disabled:opacity-50">
                {pending ? "Saving…" : `Add ${filled || ""} ${filled === 1 ? "chat" : "chats"}`.replace("  ", " ")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
