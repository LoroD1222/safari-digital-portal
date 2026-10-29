import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signMedia } from "@/lib/content";
import { CONTENT_LABEL, KIND_LABEL, type ContentComment, type ContentItem, type ContentStatus } from "@/lib/types";
import { CONTENT_TONE } from "@/lib/status-tone";
import { Badge, PageHeader, buttonClass } from "@/components/ui";
import { BackLink, Section } from "@/components/blocks";
import { Media } from "@/components/media";
import { ContentHistory } from "@/components/content-history";
import { EditContentForm } from "../content-form";
import { RevisionUpload } from "../revision";
import { deleteContent, setContentStatus } from "../actions";

export const metadata: Metadata = { title: "Content" };
const UUID = /^[0-9a-f-]{36}$/i;

function StatusButton({ id, to, label, primary }: { id: string; to: ContentStatus; label: string; primary?: boolean }) {
  return <form action={setContentStatus.bind(null, id, to)}><button className={buttonClass(primary ? "primary" : "secondary", "h-9")}>{label}</button></form>;
}

export default async function AdminContentItem(props: PageProps<"/admin/content/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("content_items").select("*, clients(name)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const item = data as ContentItem & { clients: { name: string } | null };
  const { data: comments } = await supabase.from("content_comments").select("*").eq("content_id", id).order("created_at", { ascending: false });
  const urls = await signMedia(supabase, [item]);
  const s = item.status;
  const lastFeedback = (comments as ContentComment[] | null)?.find((c) => c.kind === "changes_requested");

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/admin/content">Content</BackLink>
      <PageHeader title={item.title}
        subtitle={<><Link href={`/admin/clients/${item.client_id}`} className="font-medium text-brand no-underline">{item.clients?.name}</Link> · {KIND_LABEL[item.kind]}{item.as_ad && item.kind !== "ad" ? " · runs as an ad" : ""} · version {item.version}</>}
        actions={<Badge tone={CONTENT_TONE[s]}>{CONTENT_LABEL[s]}</Badge>} />
      {s === "changes_requested" && lastFeedback?.body && (
        <div className="rounded-card border border-[#F2C9C6] bg-[#FDF4F3] px-4 py-3">
          <p className="text-[13px] font-semibold text-[#7A2724]">The client asked for changes</p>
          <p className="whitespace-pre-wrap">“{lastFeedback.body}”</p>
        </div>
      )}
      <div className="flex flex-wrap gap-8">
        <div className="flex w-full max-w-[300px] flex-col gap-3">
          <div className="aspect-[4/5] overflow-hidden rounded-card border border-line bg-sidebar">
            <Media url={urls[item.id] ?? null} type={item.media_type} alt={item.title} controls />
          </div>
          <div className="flex flex-wrap gap-2">
            {(s === "draft" || s === "changes_requested") && item.media_path && <StatusButton id={id} to="awaiting_approval" label="Send for approval" primary />}
            {s === "approved" && <StatusButton id={id} to="scheduled" label="Mark scheduled" primary />}
            {(s === "approved" || s === "scheduled") && <StatusButton id={id} to="published" label="Mark published" primary={s === "scheduled"} />}
            {s === "published" && <StatusButton id={id} to="scheduled" label="Undo published" />}
            {s === "awaiting_approval" && <p className="text-[13px] text-slate">Waiting for the client to approve.</p>}
          </div>
        </div>
        <div className="flex min-w-[280px] flex-1 flex-col gap-6">
          <EditContentForm item={item} />
          <Section title="Upload a new version">
            <p className="-mt-1 text-[13px] text-slate">Replaces the file on this same item and sends it to the client again.</p>
            <RevisionUpload id={item.id} clientId={item.client_id} version={item.version} />
          </Section>
          <ContentHistory items={(comments ?? []) as ContentComment[]} clientLabel={item.clients?.name ?? "Client"} />
          <details className="border-t border-line-soft pt-4 text-[13px]">
            <summary className="cursor-pointer font-medium text-danger-text">Delete this content</summary>
            <form action={deleteContent.bind(null, item.id)} className="mt-2 flex items-center gap-3">
              <span className="text-slate">The file and its history are removed.</span>
              <button className="h-8 rounded-control bg-danger px-3 font-medium text-white">Delete</button>
            </form>
          </details>
        </div>
      </div>
    </div>
  );
}
