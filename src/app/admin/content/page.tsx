import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signMedia } from "@/lib/content";
import { CONTENT_LABEL, type ContentItem, type ContentStatus } from "@/lib/types";
import { ButtonLink, EmptyState, PageHeader, Select } from "@/components/ui";
import { Filters } from "@/components/blocks";
import { ContentGrid } from "@/components/content-card";
import { Icon } from "@/components/icons";

export const metadata: Metadata = { title: "Content" };
const ORDER: ContentStatus[] = ["awaiting_approval", "changes_requested", "approved", "scheduled", "published", "draft"];

export default async function AdminContent(props: PageProps<"/admin/content">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const client = typeof sp.client === "string" ? sp.client : "";
  const filter = ORDER.includes(sp.status as ContentStatus) ? (sp.status as ContentStatus) : null;

  const supabase = await createClient();
  const { data: clients } = await supabase.from("clients").select("id, name").not("marketing_package", "is", null).order("name");
  let q = supabase.from("content_items").select("*").order("updated_at", { ascending: false }).limit(300);
  if (client) q = q.eq("client_id", client);
  const { data } = await q;
  const all = (data ?? []) as ContentItem[];
  const shown = filter ? all.filter((i) => i.status === filter) : all;
  const urls = await signMedia(supabase, shown);
  const names = Object.fromEntries((clients ?? []).map((c) => [c.id, c.name as string]));
  const qs = (s: string | null) => "/admin/content?" + new URLSearchParams({ ...(client ? { client } : {}), ...(s ? { status: s } : {}) });

  return (
    <>
      <PageHeader title="Content" subtitle="Reels and posts for client approval. Publishing to Facebook and Instagram stays manual."
        actions={<ButtonLink href={`/admin/content/new${client ? `?client=${client}` : ""}`}><Icon name="plus" size={16} />Create content</ButtonLink>} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Filters label="Filter by status" items={[
          { href: qs(null), label: "All", active: !filter, count: all.length },
          ...ORDER.map((s) => ({ href: qs(s), label: CONTENT_LABEL[s], active: filter === s, count: all.filter((i) => i.status === s).length })),
        ]} />
        <form className="flex items-center gap-2">
          {filter && <input type="hidden" name="status" value={filter} />}
          <label htmlFor="client" className="sr-only">Client</label>
          <Select id="client" name="client" defaultValue={client} className="h-9 w-52">
            <option value="">All clients</option>
            {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <button className="h-9 rounded-control border border-field px-3 text-[13px] font-medium hover:bg-[#F4F5F2]">Show</button>
        </form>
      </div>
      {shown.length === 0
        ? <EmptyState title={all.length ? "Nothing with this status" : "No content yet"} body="Create a Reel or post, then send it to the client for approval." />
        : <ContentGrid items={shown} urls={urls} hrefBase="/admin/content" clientNames={client ? undefined : names} />}
    </>
  );
}
