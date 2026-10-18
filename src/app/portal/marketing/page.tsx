import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { planProgress, signMedia } from "@/lib/content";
import { monthBounds } from "@/lib/dates";
import { MARKETING_LABEL, type ContentItem } from "@/lib/types";
import { EmptyState, PageHeader } from "@/components/ui";
import { Filters, Progress } from "@/components/blocks";
import { ContentGrid } from "@/components/content-card";
import { MarketingTabs } from "./tabs";

export const metadata: Metadata = { title: "Content" };
const RANK: Record<string, number> = { awaiting_approval: 0, changes_requested: 1, approved: 2, scheduled: 3, published: 4 };

export default async function ContentPage(props: PageProps<"/portal/marketing">) {
  const { company } = await getPortalContext();
  if (!company?.marketing_package) redirect("/portal");
  const { show } = await props.searchParams;
  const filter = show === "approval" || show === "published" ? show : null;

  const supabase = await createClient();
  const { data } = await supabase.from("content_items").select("*").eq("client_id", company.id).order("created_at", { ascending: false }).limit(200);
  const all = ((data ?? []) as ContentItem[]).sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9));
  const awaiting = all.filter((i) => i.status === "awaiting_approval");
  const shown = filter === "approval" ? awaiting : filter === "published" ? all.filter((i) => i.status === "published") : all;
  const urls = await signMedia(supabase, shown);
  const month = monthBounds(0);
  const progress = planProgress(all, month.start, month.next);
  const hasPlan = !!company.plan_reels || !!company.plan_posts;

  return (
    <>
      <PageHeader title="Marketing" subtitle="Your social media content and advertising." />
      <MarketingTabs active="content" awaiting={awaiting.length} />
      {hasPlan && (
        <section aria-labelledby="plan-h" className="flex flex-col gap-3 rounded-card border border-line px-5 py-4">
          <h2 id="plan-h" className="text-[13px] text-slate"><span className="font-semibold text-ink">{MARKETING_LABEL[company.marketing_package]} Marketing</span> · {month.label}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {!!company.plan_reels && <Progress label="Reels" done={progress.reels} total={company.plan_reels} />}
            {!!company.plan_posts && <Progress label="Social posts" done={progress.posts} total={company.plan_posts} />}
          </div>
        </section>
      )}
      <Filters label="Show" items={[
        { href: "/portal/marketing", label: "All", active: !filter, count: all.length },
        { href: "/portal/marketing?show=approval", label: "Needs approval", active: filter === "approval", count: awaiting.length },
        { href: "/portal/marketing?show=published", label: "Published", active: filter === "published" },
      ]} />
      {shown.length === 0 ? (
        <EmptyState
          title={filter === "approval" ? "You're all caught up" : "No content yet"}
          body={filter === "approval" ? "Nothing is waiting for your approval." : "When we prepare Reels and posts for you, they'll appear here for you to approve."} />
      ) : (
        <ContentGrid items={shown} urls={urls} hrefBase="/portal/marketing" statusLabel={{ awaiting_approval: "Needs your approval" }} />
      )}
    </>
  );
}
