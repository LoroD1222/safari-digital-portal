import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACCOUNT_LABEL, ONBOARDING_LABEL, packageSummary, type Client } from "@/lib/types";
import { ACCOUNT_TONE, ONBOARDING_TONE } from "@/lib/status-tone";
import { Alert, Badge, PageHeader } from "@/components/ui";
import { ClientForm } from "../client-form";
import { updateClientRecord } from "../actions";
import { PortalAccess } from "../portal-access";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Client" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ClientPage(props: PageProps<"/admin/clients/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const { created } = await props.searchParams;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const client = data as Client;

  // Who can sign in to this client's portal, and whether they've set a password.
  const admin = createAdminClient();
  const { data: profiles } = await admin.from("profiles").select("id, email").eq("client_id", client.id).order("email");
  const members = await Promise.all(
    (profiles ?? []).map(async (p) => {
      const { data: u } = await admin.auth.admin.getUserById(p.id);
      return { id: p.id, email: p.email as string, confirmed: !!u?.user?.last_sign_in_at };
    }),
  );

  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <Link href="/admin/clients" className="text-[13px] font-medium text-brand no-underline">← Clients</Link>
      <PageHeader
        title={client.name}
        subtitle={packageSummary(client)}
        actions={
          <>
            <Badge tone={ONBOARDING_TONE[client.onboarding_status]}>{ONBOARDING_LABEL[client.onboarding_status]}</Badge>
            <Badge tone={ACCOUNT_TONE[client.account_status]}>{ACCOUNT_LABEL[client.account_status]}</Badge>
          </>
        }
      />
      {created && <Alert tone="success">{client.name} was added.</Alert>}
      <PortalAccess clientId={client.id} members={members} />
      <ClientForm action={updateClientRecord.bind(null, client.id)} client={client} submitLabel="Save changes" cancelHref="/admin/clients" />
    </div>
  );
}
