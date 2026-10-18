import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/blocks";
import { NewContentForm } from "../content-form";

export const metadata: Metadata = { title: "Create content" };

export default async function NewContent(props: PageProps<"/admin/content/new">) {
  await requireAdmin();
  const { client } = await props.searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("id, name").order("name");
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <BackLink href="/admin/content">Content</BackLink>
      <PageHeader title="Create content" />
      <NewContentForm clients={(data ?? []) as { id: string; name: string }[]} defaultClient={typeof client === "string" ? client : undefined} />
    </div>
  );
}
