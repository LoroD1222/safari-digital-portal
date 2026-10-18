import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Client, ContentItem, SupportRequest } from "@/lib/types";
import { ButtonLink, EmptyState, PageHeader, Stat } from "@/components/ui";
import { ActivityList, AttentionList, Section, type AttentionItem } from "@/components/blocks";
import { Icon } from "@/components/icons";

export const metadata: Metadata = { title: "Overview" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Dar_es_Salaam" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function AdminOverview() {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const [{ data: cs }, { data: content }, { data: reqs }, { data: act }] = await Promise.all([
    supabase.from("clients").select("*").order("updated_at", { ascending: false }),
    supabase.from("content_items").select("id, client_id, title, status, updated_at").in("status", ["awaiting_approval", "changes_requested", "approved"]),
    supabase.from("requests").select("*").neq("status", "completed").order("last_message_at", { ascending: false }),
    supabase.from("activity").select("id, client_id, message, created_at, admin_link, actor_role").order("created_at", { ascending: false }).limit(8),
  ]);
  const clients = (cs ?? []) as Client[];
  const items = (content ?? []) as ContentItem[];
  const requests = (reqs ?? []) as SupportRequest[];
  const name = Object.fromEntries(clients.map((c) => [c.id, c.name]));

  const live = clients.filter((c) => c.account_status !== "paused");
  const awaitingOnboarding = live.filter((c) => c.onboarding_status !== "setup_complete");
  const awaitingApproval = items.filter((i) => i.status === "awaiting_approval");

  const attention: AttentionItem[] = [];
  for (const c of live.filter((c) => c.onboarding_status === "submitted")) attention.push({ key: `ob-${c.id}`, title: `${c.name} — onboarding submitted`, detail: "Ready to review", href: `/admin/clients/${c.id}?tab=onboarding` });
  for (const i of items.filter((i) => i.status === "changes_requested")) attention.push({ key: `ch-${i.id}`, title: `${name[i.client_id] ?? "Client"} — changes requested`, detail: i.title, href: `/admin/content/${i.id}`, tone: "red" });
  for (const c of live.filter((c) => c.design_review === "changes_requested" && c.website_stage === "awaiting_approval")) attention.push({ key: `ds-${c.id}`, title: `${c.name} — design feedback`, detail: c.design_feedback ?? undefined, href: `/admin/clients/${c.id}`, tone: "red" });
  for (const r of requests.filter((r) => r.last_message_role === "client" && r.status !== "waiting_for_client")) attention.push({ key: `rq-${r.id}`, title: `${name[r.client_id] ?? "Client"} — ${r.status === "submitted" ? "new request" : "replied"}`, detail: r.subject, href: `/admin/requests/${r.id}` });
  for (const c of live.filter((c) => c.marketing_package && !c.meta_access_confirmed && ["submitted", "being_reviewed", "setup_complete"].includes(c.onboarding_status))) attention.push({ key: `meta-${c.id}`, title: `${c.name} — Meta access not confirmed`, detail: "Check Business Suite, then confirm in Connections", href: `/admin/clients/${c.id}?tab=connections`, tone: "blue" });
  for (const i of items.filter((i) => i.status === "approved")) attention.push({ key: `ap-${i.id}`, title: `${name[i.client_id] ?? "Client"} — approved, ready to schedule`, detail: i.title, href: `/admin/content/${i.id}`, tone: "blue" });

  const first = (viewer.fullName ?? "").split(" ")[0];
  return (
    <>
      <PageHeader title={`${greeting()}${first ? `, ${first}` : ""}`} subtitle="Here's what needs doing today." />
      <section aria-label="Summary" className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Stat label="Active clients" value={clients.filter((c) => c.account_status === "active").length} href="/admin/clients" />
        <Stat label="Awaiting onboarding" value={awaitingOnboarding.length} href="/admin/clients" />
        <Stat label="Content awaiting approval" value={awaitingApproval.length} href="/admin/content?status=awaiting_approval" />
        <Stat label="Open requests" value={requests.length} href="/admin/requests" />
      </section>
      {clients.length === 0 ? (
        <EmptyState title="No clients yet" body="Add your first client to start tracking their onboarding, content and inquiries."
          action={<ButtonLink href="/admin/clients/new"><Icon name="plus" size={16} />Add client</ButtonLink>} />
      ) : (
        <div className="flex flex-wrap gap-8">
          <div className="min-w-[280px] flex-[1_1_400px]">
            <Section title="Needs attention">
              <AttentionList items={attention.slice(0, 12)} empty="Nothing waiting on you right now." />
            </Section>
          </div>
          <div className="min-w-[260px] flex-[1_1_280px]">
            <Section title="Recent activity">
              <ActivityList empty="Client activity will show up here."
                items={(act ?? []).map((a) => ({ id: a.id, message: a.message, created_at: a.created_at, href: a.admin_link, who: name[a.client_id] }))} />
            </Section>
          </div>
        </div>
      )}
    </>
  );
}
