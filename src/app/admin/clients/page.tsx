import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ACCOUNT_LABEL, ONBOARDING_LABEL, packageSummary, type Client } from "@/lib/types";
import { ACCOUNT_TONE, ONBOARDING_TONE } from "@/lib/status-tone";
import { Badge, ButtonLink, EmptyState, Input, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage(props: PageProps<"/admin/clients">) {
  await requireAdmin();
  const { q } = await props.searchParams;
  const query = typeof q === "string" ? q.trim() : "";

  const supabase = await createClient();
  let req = supabase.from("clients").select("*").order("name");
  if (query) req = req.or(`name.ilike.%${query.replace(/[%,()]/g, "")}%,contact_name.ilike.%${query.replace(/[%,()]/g, "")}%`);
  const { data, error } = await req;
  const clients = (data ?? []) as Client[];

  return (
    <>
      <PageHeader
        title="Clients"
        actions={<ButtonLink href="/admin/clients/new"><Icon name="plus" size={16} />Add client</ButtonLink>}
      />
      <form role="search" className="flex max-w-sm items-center gap-2">
        <label htmlFor="q" className="sr-only">Search clients</label>
        <Input id="q" name="q" type="search" placeholder="Search by company or contact" defaultValue={query} />
      </form>

      {error ? (
        <EmptyState title="We couldn't load clients" body="Refresh the page. If it keeps happening, check the database connection." />
      ) : clients.length === 0 ? (
        query
          ? <EmptyState title="No clients match" body={`Nothing found for “${query}”.`} action={<Link href="/admin/clients" className="font-medium text-brand">Clear search</Link>} />
          : <EmptyState title="No clients yet" body="Add a client to start onboarding them." action={<ButtonLink href="/admin/clients/new"><Icon name="plus" size={16} />Add client</ButtonLink>} />
      ) : (
        <div className="overflow-hidden rounded-card border border-line">
          <div aria-hidden="true" className="hidden gap-4 border-b border-line-soft bg-sidebar px-4 py-2.5 text-xs font-medium text-slate md:flex">
            <span className="flex-[1_1_220px]">Client</span>
            <span className="flex-[1_1_220px]">Package</span>
            <span className="w-36">Onboarding</span>
            <span className="w-24">Account</span>
          </div>
          <ul>
            {clients.map((c, i) => (
              <li key={c.id} className={i ? "border-t border-line-soft" : ""}>
                <Link href={`/admin/clients/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-ink no-underline hover:bg-[#FAFAF8]">
                  <span className="flex min-w-0 flex-[1_1_220px] flex-col">
                    <span className="font-medium">{c.name}</span>
                    <span className="truncate text-xs text-slate">{c.contact_name ?? c.contact_email ?? "No contact yet"}</span>
                  </span>
                  <span className="flex-[1_1_220px] text-[13px] text-body">{packageSummary(c)}</span>
                  <span className="w-36"><Badge tone={ONBOARDING_TONE[c.onboarding_status]}>{ONBOARDING_LABEL[c.onboarding_status]}</Badge></span>
                  <span className="w-24"><Badge tone={ACCOUNT_TONE[c.account_status]}>{ACCOUNT_LABEL[c.account_status]}</Badge></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
