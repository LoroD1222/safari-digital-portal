"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./icons";
import { FAQS } from "@/lib/faqs";

function Option({ href, icon, tone, title, sub, external, onClick }: { href: string; icon: IconName; tone: string; title: string; sub: string; external?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className={"flex size-10 flex-none items-center justify-center rounded-[10px] " + tone}><Icon name={icon} size={20} /></span>
      <span className="flex min-w-0 flex-1 flex-col"><span className="font-semibold">{title}</span><span className="text-[13px] text-slate">{sub}</span></span>
      <Icon name="chevronRight" size={16} className="text-slate" />
    </>
  );
  const cls = "flex items-center gap-3 rounded-card border border-line bg-white p-3.5 text-ink no-underline hover:bg-[#F4F5F2]";
  return external
    ? <a href={href} target="_blank" rel="noreferrer" className={cls}>{body}</a>
    : <Link href={href} className={cls} onClick={onClick}>{body}</Link>;
}

// "Help" in the sidebar opens a panel from the right, as in the design.
export function HelpButton({ whatsapp, email, openRequests }: { whatsapp: string | null; email: string | null; openRequests: number }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);
  const active = path.startsWith("/portal/help") || path.startsWith("/portal/requests");
  const wa = whatsapp?.replace(/[^\d]/g, "");

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className={"flex min-h-10 w-full items-center gap-2.5 rounded-control px-2.5 text-left font-medium " +
          (active ? "bg-white text-ink shadow-[0_0_0_1px_#E6E8EC,0_1px_2px_rgba(0,3,33,0.04)] [&_svg]:text-brand" : "text-body hover:bg-[#EDEFEB]")}>
        <Icon name="help" />
        <span className="flex-1">Help</span>
        {openRequests > 0 && <span aria-label={`${openRequests} replies`} className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">{openRequests}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close help" onClick={() => setOpen(false)} className="absolute inset-0 bg-[rgba(0,3,33,0.35)]" />
          <aside role="dialog" aria-modal="true" aria-labelledby="help-h"
            className="absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col overflow-y-auto bg-white shadow-[-12px_0_40px_rgba(0,3,33,0.15)]">
            <div className="flex items-center justify-between border-b border-line-soft px-5 py-[18px]">
              <h2 id="help-h" className="text-[17px] font-semibold">How can we help?</h2>
              <button ref={closeRef} type="button" aria-label="Close" onClick={() => setOpen(false)} className="inline-flex size-8 items-center justify-center rounded-control text-slate hover:bg-[#F4F5F2]">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-7 p-5">
              <div className="flex flex-col gap-2.5">
                {wa && <Option external href={`https://wa.me/${wa}`} icon="chat" tone="bg-[#E3F4EA] text-brand" title="Chat on WhatsApp" sub="Fastest way to reach us · Mon–Sat" />}
                {email && <Option external href={`mailto:${email}`} icon="mail" tone="bg-[#F1F2F4] text-body" title="Send an email" sub="We reply within one working day" />}
                <Option href="/portal/help" onClick={() => setOpen(false)} icon="message" tone="bg-[#F1F2F4] text-body" title="Send a request"
                  sub={openRequests > 0 ? `${openRequests} request${openRequests > 1 ? "s" : ""} with a new reply` : "Ask for help and follow the replies here"} />
              </div>
              <section aria-labelledby="faq-h" className="flex flex-col">
                <h3 id="faq-h" className="mb-2 text-[15px] font-semibold">Common questions</h3>
                {FAQS.map(([q, a]) => (
                  <details key={q} className="group border-t border-line-soft">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2.5 font-medium [&::-webkit-details-marker]:hidden">
                      <Icon name="chevronRight" size={14} className="flex-none text-slate transition-transform group-open:rotate-90" />{q}
                    </summary>
                    <p className="mb-3.5 ml-6 text-body">{a}</p>
                  </details>
                ))}
              </section>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
