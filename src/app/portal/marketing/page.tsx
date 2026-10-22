import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { planProgress, signMedia } from "@/lib/content";
import { monthBounds } from "@/lib/dates";
import { MARKETING_LABEL, type ContentComment, type ContentItem } from "@/lib/types";
import { MarketingTabs } from "./tabs";
import { ContentBoard, type BoardComment } from "./content-board";

export const metadata: Metadata = { title: "Content" };

export default async function ContentPage(props: PageProps<"/portal/marketing">) {
  const { company } = await getPortalContext();
  if (!company?.marketing_package) redirect("/portal");
  const sp = await props.searchParams;
  const month = monthBounds(0);

  const supabase = await createClient();
  const { data } = await supabase.from("content_items").select("*").eq("client_id", company.id).order("created_at", { ascending: false }).limit(200);
  // "This month": everything not yet published, plus what was published this month.
  const items = ((data ?? []) as ContentItem[]).filter((i) => i.status !== "published" || (i.published_at ?? "") >= month.start);
  const awaiting = items.filter((i) => i.status === "awaiting_approval").length;
  const [urls, { data: cm }] = await Promise.all([
    signMedia(supabase, items),
    items.length
      ? supabase.from("content_comments").select("*").in("content_id", items.map((i) => i.id)).not("body", "is", null).order("created_at")
      : Promise.resolve({ data: [] }),
  ]);
  const comments: BoardComment[] = ((cm ?? []) as ContentComment[]).map((c) => ({
    id: c.id, content_id: c.content_id, who: c.author_role === "client" ? "You" : "Safari Digital",
    when: new Date(c.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Dar_es_Salaam" }),
    text: c.body ?? "",
  }));
  const progress = planProgress((data ?? []) as ContentItem[], month.start, month.next);
  const plan = [
    company.plan_reels ? { label: "Reels", done: progress.reels, total: company.plan_reels } : null,
    company.plan_posts ? { label: "Social posts", done: progress.posts, total: company.plan_posts } : null,
  ].filter(Boolean) as { label: string; done: number; total: number }[];

  return (
    <>
      <div className="-mb-1 flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Marketing</h1>
        <MarketingTabs active="content" awaiting={awaiting} />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[17px] font-semibold">Your social media content</h2>
          <span className="text-[13px] text-slate">{MARKETING_LABEL[company.marketing_package]} Marketing · {month.label}</span>
        </div>
        {plan.length > 0 && (
          <div className="flex flex-wrap gap-6">
            {plan.map((p) => (
              <div key={p.label} className="flex w-[170px] flex-col gap-1.5">
                <div className="flex justify-between text-[13px]"><span className="font-medium">{p.label}</span><span className="tabular-nums text-slate">{p.done} of {p.total}</span></div>
                <div role="progressbar" aria-label={`${p.label} published this month`} aria-valuenow={p.done} aria-valuemin={0} aria-valuemax={p.total} className="h-1.5 overflow-hidden rounded-full bg-line-soft">
                  <div className="h-full bg-brand" style={{ width: `${Math.min(100, Math.round((p.done / p.total) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <ContentBoard items={items} urls={urls} comments={comments} openId={typeof sp.open === "string" ? sp.open : null} />
    </>
  );
}
