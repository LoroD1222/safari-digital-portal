import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, invoiceState, type Invoice, mrr, mrrHistory, type Client, type ClientPrivate, type ContentItem, type Currency, type SupportRequest } from "@/lib/types";
import { ButtonLink, EmptyState, PageHeader, Stat } from "@/components/ui";
import { ActivityList, AttentionList, Section, type AttentionItem } from "@/components/blocks";
import { Icon } from "@/components/icons";
import { MrrChart } from "@/components/mrr-chart";

export const metadata: Metadata = { title: "Overview" };

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Dar_es_Salaam" }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default async function AdminOverview() {
  const viewer = await requireAdmin();
  const supabase = await createClient();
  const [{ data: cs }, { data: content }, { data: reqs }, { data: act }, { data: bills, error: billsError }] = await Promise.all([
    supabase.from("clients").select("*").order("updated_at", { ascending: false }),
    supabase.from("content_items").select("id, client_id, title, status, updated_at").in("status", ["awaiting_approval", "changes_requested", "approved"]),
    supabase.from("requests").select("*").neq("status", "completed").order("last_message_at", { ascending: false }),
    supabase.from("activity").select("id, client_id, message, created_at, admin_link, actor_role").order("created_at", { ascending: false }).limit(8),
    supabase.from("client_private").select("client_id, monthly_fee, currency, billing_start"),
  ]);
  const clients = (cs ?? []) as Client[];
  const items = (content ?? []) as ContentItem[];
  const requests = (reqs ?? []) as SupportRequest[];
  const name = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const revenue = mrr(clients, (bills ?? []) as ClientPrivate[]);
  const totals = (Object.entries(revenue.totals) as [Currency, number][]).filter(([, v]) => v > 0);
  const activeCount = clients.filter((c) => c.account_status !== "paused").length;
  // Chart the main currency (the one with the most revenue).
  const chartCurrency = (totals.slice().sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD") as Currency;
  const history = totals.length || revenue.upcoming ? mrrHistory(clients, (bills ?? []) as ClientPrivate[], chartCurrency) : [];

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

  const { data: invs } = await supabase.from("invoices").select("id, client_id, number, total, due_date, status").in("status", ["draft", "sent"]);
  const drafts = (invs ?? []).filter((i) => i.status === "draft");
  if (drafts.length) attention.push({ key: "inv-drafts", title: `${drafts.length} invoice ${drafts.length === 1 ? "draft" : "drafts"} to send`, detail: "Check the lines, then send", href: "/admin/invoices?status=draft", tone: "blue" });
  for (const i of (invs ?? []).filter((i) => i.status === "sent" && invoiceState(i as Pick<Invoice, "status" | "due_date">) === "overdue")) {
    attention.push({ key: `inv-${i.id}`, title: `${name[i.client_id] ?? "Client"} — invoice overdue`, detail: `${i.number} · ${formatMoney(Number(i.total), "USD")}`, href: `/admin/invoices/${i.id}`, tone: "red" });
  }

  const first = (viewer.fullName ?? "").split(" ")[0];
  return (
    <>
      <PageHeader title={`${greeting()}${first ? `, ${first}` : ""}`} subtitle="Here's what needs doing today." />
      <section aria-label="Summary" className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Stat label="MRR" value={totals.length ? totals.map(([c, v]) => formatMoney(v, c)).join(" + ") : "—"}
          note={billsError ? "Run 0007_billing.sql in Supabase" : totals.length ? `${revenue.paying} of ${revenue.billable} clients priced${revenue.upcoming ? ` · ${revenue.upcoming} starting later` : ""}` : revenue.upcoming ? `${revenue.upcoming} starting later` : "Add each client's monthly price"} href="/admin/clients" />
        <Stat label="Active clients" value={activeCount} href="/admin/clients" />
        <Stat label="Awaiting onboarding" value={awaitingOnboarding.length} href="/admin/clients" />
        <Stat label="Content awaiting approval" value={awaitingApproval.length} href="/admin/content?status=awaiting_approval" />
        <Stat label="Open requests" value={requests.length} href="/admin/requests" />
      </section>
      {history.length > 0 && (
        <MrrChart data={history} currency={chartCurrency}
          note={totals.length > 1 ? `In ${chartCurrency}, from each client's price and start date. Other currencies aren't included in the chart.` : undefined} />
      )}
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
