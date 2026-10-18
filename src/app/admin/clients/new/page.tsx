import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ClientForm } from "../client-form";
import { createClientRecord } from "../actions";

export const metadata: Metadata = { title: "Add client" };

export default async function NewClientPage() {
  await requireAdmin();
  return (
    <div className="flex max-w-[720px] flex-col gap-6">
      <Link href="/admin/clients" className="text-[13px] font-medium text-brand no-underline">← Clients</Link>
      <PageHeader title="Add client" subtitle="You can invite them to the portal once they're added." />
      <ClientForm action={createClientRecord} submitLabel="Add client" cancelHref="/admin/clients" />
    </div>
  );
}
