import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { signMedia } from "@/lib/content";
import { fmtDate } from "@/lib/dates";
import { CONTENT_LABEL, KIND_LABEL, PLATFORM_LABEL, type ContentComment, type ContentItem } from "@/lib/types";
import { CONTENT_TONE } from "@/lib/status-tone";
import { Badge, PageHeader } from "@/components/ui";
import { BackLink, DetailList } from "@/components/blocks";
import { Media } from "@/components/media";
import { ContentHistory } from "@/components/content-history";
import { ReviewPanel } from "./review";

export const metadata: Metadata = { title: "Content" };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function ContentItemPage(props: PageProps<"/portal/marketing/[id]">) {
  const { company } = await getPortalContext();
  const { id } = await props.params;
  if (!company || !UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("content_items").select("*").eq("id", id).eq("client_id", company.id).maybeSingle();
  if (!data) notFound();
  const item = data as ContentItem;
  const { data: comments } = await supabase.from("content_comments").select("*").eq("content_id", id).order("created_at", { ascending: false });
  const urls = await signMedia(supabase, [item]);

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/portal/marketing">Content</BackLink>
      <PageHeader title={item.title} subtitle={`${KIND_LABEL[item.kind]} · ${PLATFORM_LABEL[item.platform]}`}
        actions={<Badge tone={CONTENT_TONE[item.status]}>{item.status === "awaiting_approval" ? "Needs your approval" : CONTENT_LABEL[item.status]}</Badge>} />
      <div className="flex flex-wrap gap-8">
        <div className="aspect-[4/5] w-full max-w-[340px] overflow-hidden rounded-card border border-line bg-sidebar">
          <Media url={urls[item.id] ?? null} type={item.media_type} alt={item.title} controls />
        </div>
        <div className="flex min-w-[260px] flex-1 flex-col gap-6">
          {item.status === "awaiting_approval" && <ReviewPanel id={item.id} />}
          <DetailList rows={[
            ["Caption", item.caption],
            [item.status === "published" ? "Published" : "Publishing date", item.status === "published" ? fmtDate(item.published_at, true) : item.scheduled_for ? fmtDate(item.scheduled_for, true) : "Not set yet"],
            ["Where", PLATFORM_LABEL[item.platform]],
          ]} />
          <ContentHistory items={(comments ?? []) as ContentComment[]} clientLabel="You" />
        </div>
      </div>
    </div>
  );
}
