"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Toast = { id: string; name: string; interest: string | null };

// Listens for new inquiries and refreshes the page data in place, with a small
// "New inquiry" card. Also refreshes when the tab comes back into view.
export function LiveInquiries({ clientId, href }: { clientId?: string; href: string }) {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`inquiries-${clientId ?? "all"}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "inquiries",
        ...(clientId ? { filter: `client_id=eq.${clientId}` } : {}),
      }, (payload) => {
        const row = payload.new as { id: string; name?: string; interested_in?: string | null };
        router.refresh();
        setToasts((t) => [...t.slice(-2), { id: row.id, name: row.name || "Someone", interest: row.interested_in ?? null }]);
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== row.id)), 10_000);
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "inquiries",
        ...(clientId ? { filter: `client_id=eq.${clientId}` } : {}),
      }, () => router.refresh())
      .subscribe();

    let hiddenAt = 0;
    const onVis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 30_000) router.refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); supabase.removeChannel(channel); };
  }, [clientId, router]);

  if (!toasts.length) return null;
  return (
    <div aria-live="polite" className="fixed bottom-4 right-4 z-50 flex w-[min(340px,calc(100vw-32px))] flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} className="flex items-start gap-3 rounded-card border border-line bg-white p-3.5 shadow-lg">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">New inquiry</p>
            <p className="truncate text-[13px] text-body">{t.name}{t.interest ? ` · ${t.interest}` : ""}</p>
          </div>
          <Link href={href} onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
            className="shrink-0 rounded-control bg-brand px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-brand-hover">View</Link>
          <button type="button" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
            className="shrink-0 px-1 text-[16px] leading-none text-slate hover:text-ink">×</button>
        </div>
      ))}
    </div>
  );
}
