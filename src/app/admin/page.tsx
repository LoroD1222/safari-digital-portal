import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ONBOARDING_LABEL, type Client } from "@/lib/types";
import { ONBOARDING_TONE } from "@/lib/status-tone";
import { Badge, ButtonLink, EmptyState, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata: Metadata = { title: "Overview" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Dar_es_Salaam" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function AdminOverview() {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").order("updated_at", { ascending: false });
  const clients = (data ?? []) as Client[];

  const active = clients.filter((c) => c.account_status === "active").length;
  const awaiting = clients.filter((c) => c.onboarding_status !== "setup_complete" && c.account_status !== "paused").length;
  const toReview = clients.filter((c) => c.onboarding_status === "submitted");
  const first = (viewer.fullName ?? "").split(" ")[0];

  return (
    <>
      <PageHeader title={`${greeting()}${first ? `, ${first}` : ""}`} subtitle="Here's what needs doing today." />
      <section aria-label="Summary" className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <Stat label="Active clients" value={active} href="/admin/clients" />
        <Stat label="Awaiting onboarding" value={awaiting} href="/admin/clients" />
        <Stat label="Onboarding to review" value={toReview.length} href="/admin/clients" />
      </section>

      <section aria-labelledby="att-h" className="flex flex-col gap-3">
        <h2 id="att-h" className="text-[15px] font-semibold">Needs attention</h2>
        {clients.length === 0 ? (
          <EmptyState
            title="No clients yet"
            body="Add your first client to start tracking their onboarding, content and inquiries."
            action={<ButtonLink href="/admin/clients/new"><Icon name="plus" size={16} />Add client</ButtonLink>}
          />
        ) : toReview.length === 0 ? (
          <p className="rounded-card border border-line px-5 py-6 text-slate">Nothing waiting on you right now.</p>
        ) : (
          <ul className="overflow-hidden rounded-card border border-line">
            {toReview.map((c, i) => (
              <li key={c.id} className={i ? "border-t border-line-soft" : ""}>
                <Link href={`/admin/clients/${c.id}`} className="flex items-center gap-3.5 px-4 py-3.5 text-ink no-underline hover:bg-[#FAFAF8]">
                  <span className="size-2 flex-none rounded-full bg-[#E0A458]" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-slate">Onboarding submitted · ready to review</span>
                  </span>
                  <Badge tone={ONBOARDING_TONE[c.onboarding_status]}>{ONBOARDING_LABEL[c.onboarding_status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
