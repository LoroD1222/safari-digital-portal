import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ACCOUNT_LABEL, CATEGORY_LABEL, ONBOARDING_LABEL, REQUEST_LABEL_ADMIN, packageSummary,
  type AdReport, type Client, type ClientPrivate, type SupportRequest,
} from "@/lib/types";
import { ACCOUNT_TONE, ONBOARDING_TONE, REQUEST_TONE } from "@/lib/status-tone";
import { monthBounds, fmtDate, money } from "@/lib/dates";
import { Alert, Badge, PageHeader } from "@/components/ui";
import { Row, RowList, Section, Tabs } from "@/components/blocks";
import { ClientForm } from "../client-form";
import { updateClientRecord } from "../actions";
import { PortalAccess } from "../portal-access";
import { OnboardingSummary } from "../onboarding-summary";
import { DataSection } from "../data-section";
import { DangerZone } from "../danger-zone";
import { MetaAdsGrid } from "@/components/meta-ads";
import type { MetaAd } from "@/lib/types";
import { AdReportForm, MissingInfoForm, PlanForm, WebsiteProjectForm } from "../manage-forms";
import { setOnboardingStatus } from "../manage-actions";
import { listOnboardingFiles } from "@/lib/client-files";
import type { Answers } from "@/lib/onboarding";

export const metadata: Metadata = { title: "Client" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TABS = ["overview", "onboarding", "reporting", "connections"] as const;
type Tab = (typeof TABS)[number];

export default async function ClientPage(props: PageProps<"/admin/clients/[id]">) {
  await requireAdmin();
  const { id } = await props.params;
  const sp = await props.searchParams;
  if (!UUID.test(id)) notFound();
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";

  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const client = data as Client;
  const base = `/admin/clients/${client.id}`;

  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <Link href="/admin/clients" className="w-fit text-[13px] font-medium text-brand no-underline">← Clients</Link>
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
      {sp.created && <Alert tone="success">{client.name} was added.{typeof sp.invited === "string" ? ` An invite to the portal was emailed to ${sp.invited}.` : ""}</Alert>}
      {sp.invite_link && <Alert tone="info">The login was created, but the invite couldn&apos;t be emailed. Use &ldquo;Send a new invite&rdquo; under Portal access, or copy the link from there.</Alert>}
      {typeof sp.invite_error === "string" && <Alert>Couldn&apos;t invite them: {sp.invite_error}</Alert>}
      <Tabs label="Client sections" items={[
        { href: base, label: "Overview", active: tab === "overview" },
        { href: `${base}?tab=onboarding`, label: "Onboarding", active: tab === "onboarding", count: client.onboarding_status === "submitted" ? 1 : 0 },
        { href: `${base}?tab=reporting`, label: "Reporting", active: tab === "reporting" },
        { href: `${base}?tab=connections`, label: "Connections", active: tab === "connections" },
      ]} />
      {tab === "overview" && <OverviewTab client={client} />}
      {tab === "onboarding" && <OnboardingTab client={client} />}
      {tab === "reporting" && <ReportingTab client={client} month={typeof sp.month === "string" ? sp.month : null} />}
      {tab === "connections" && <DataSection client={client} />}
    </div>
  );
}

async function OverviewTab({ client }: { client: Client }) {
  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: profiles } = await admin.from("profiles").select("id, email").eq("client_id", client.id).order("email");
  const members = await Promise.all(
    (profiles ?? []).map(async (p) => {
      const { data: u } = await admin.auth.admin.getUserById(p.id);
      return { id: p.id, email: p.email as string, confirmed: !!u?.user?.last_sign_in_at };
    }),
  );
  const { data: reqs } = await supabase.from("requests").select("*").eq("client_id", client.id).order("last_message_at", { ascending: false }).limit(5);
  const requests = (reqs ?? []) as SupportRequest[];
  const { data: billing } = await supabase.from("client_private").select("*").eq("client_id", client.id).maybeSingle();

  return (
    <>
      <Link href={`/admin/clients/${client.id}?tab=onboarding`} className="flex flex-wrap items-center gap-3 rounded-card border border-line px-4 py-3 text-ink no-underline hover:border-[#C9CDD6]">
        <span className="flex min-w-[200px] flex-1 flex-col">
          <span className="font-medium">Onboarding answers</span>
          <span className="text-[13px] text-slate">Everything {client.name} filled in: business details, Facebook &amp; Instagram, website and files.</span>
        </span>
        <Badge tone={ONBOARDING_TONE[client.onboarding_status]}>{ONBOARDING_LABEL[client.onboarding_status]}</Badge>
        <span className="text-[13px] font-medium text-brand">View answers →</span>
      </Link>
      <PortalAccess clientId={client.id} members={members} />
      {client.website_package && (
        <Section title="Website project">
          <WebsiteProjectForm client={client} />
        </Section>
      )}
      {client.marketing_package && (
        <Section title="Monthly content plan">
          <p className="-mt-1 text-[13px] text-slate">How many Reels and posts this client gets each month. Shown on their dashboard as published / planned.</p>
          <PlanForm client={client} />
        </Section>
      )}
      <Section title="Recent requests" action={<Link href={`/admin/requests?client=${client.id}`} className="text-[13px] font-medium text-brand no-underline">All requests</Link>}>
        {requests.length === 0 ? <p className="text-[13px] text-slate">No requests yet.</p> : (
          <RowList>
            {requests.map((r) => (
              <Row key={r.id} href={`/admin/requests/${r.id}`}>
                <span className="flex min-w-0 flex-1 flex-col"><span className="font-medium">{r.subject}</span><span className="text-xs text-slate">{CATEGORY_LABEL[r.category]} · {fmtDate(r.last_message_at)}</span></span>
                <Badge tone={REQUEST_TONE[r.status]}>{REQUEST_LABEL_ADMIN[r.status]}</Badge>
              </Row>
            ))}
          </RowList>
        )}
      </Section>
      <div className="border-t border-line-soft pt-6">
        <ClientForm action={updateClientRecord.bind(null, client.id)} client={client} billing={billing as ClientPrivate | null} submitLabel="Save changes" cancelHref="/admin/clients" />
      </div>
      <DangerZone clientId={client.id} name={client.name} logins={members.length} />
    </>
  );
}

async function OnboardingTab({ client }: { client: Client }) {
  const admin = createAdminClient();
  const { data: ob } = await admin.from("onboarding_responses").select("data, submitted_at").eq("client_id", client.id).maybeSingle();
  const stored = await listOnboardingFiles(admin, client.id);
  const { data: signed } = stored.length ? await admin.storage.from("client-files").createSignedUrls(stored.map((f) => f.path), 3600) : { data: [] };
  const files = stored.map((f, i) => ({ ...f, url: signed?.[i]?.signedUrl ?? null }));
  const s = client.onboarding_status;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-line px-4 py-3.5">
        <span className="flex min-w-[200px] flex-1 flex-col">
          <span className="text-[13px] text-slate">Status</span>
          <span className="font-medium">{ONBOARDING_LABEL[s]}</span>
        </span>
        {(s === "submitted") && (
          <form action={setOnboardingStatus.bind(null, client.id, "being_reviewed")}>
            <button className="h-9 rounded-control border border-field bg-white px-3.5 text-[13px] font-medium hover:bg-[#F4F5F2]">Mark as being reviewed</button>
          </form>
        )}
        {s !== "setup_complete" && (
          <form action={setOnboardingStatus.bind(null, client.id, "setup_complete")}>
            <button className="h-9 rounded-control bg-brand px-3.5 text-[13px] font-semibold text-white hover:bg-brand-hover">Mark setup complete</button>
          </form>
        )}
      </div>
      {client.marketing_package && (
        <p className="text-[13px] text-body">
          Meta access: {client.meta_access_confirmed ? <Badge tone="green">Confirmed</Badge> : <><Badge tone="amber">Not confirmed</Badge> · <Link href={`/admin/clients/${client.id}?tab=connections`} className="font-medium text-brand no-underline">Confirm in Connections</Link></>}
        </p>
      )}
      <Section title="Ask for missing information">
        {client.onboarding_note && <Alert tone="info">Currently asked: “{client.onboarding_note}”</Alert>}
        <MissingInfoForm client={client} />
      </Section>
      <OnboardingSummary answers={(ob?.data as Answers) ?? null} submittedAt={ob?.submitted_at ?? null} files={files} />
    </>
  );
}

async function ReportingTab({ client, month }: { client: Client; month: string | null }) {
  const options = Array.from({ length: 12 }, (_, i) => monthBounds(-i));
  const current = options.find((o) => o.start === month) ?? options[0];
  const supabase = await createClient();
  const [{ data: rep }, { count }, { data: recent }, { data: adRows }] = await Promise.all([
    supabase.from("ad_reports").select("*").eq("client_id", client.id).eq("month", current.start).maybeSingle(),
    supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("client_id", client.id).gte("received_at", current.start).lt("received_at", current.next),
    supabase.from("ad_reports").select("month, meta_spend, meta_inquiries, updated_at").eq("client_id", client.id).order("month", { ascending: false }).limit(6),
    supabase.from("meta_ads").select("*").eq("client_id", client.id).order("created_time", { ascending: false }),
  ]);
  const ads = (adRows ?? []) as MetaAd[];
  const report = rep as AdReport | null;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold">Advertising results · {current.label}</h2>
          <p className="text-[13px] text-slate">{report ? `${report.source === "synced" ? "Synced from Meta" : "Last updated"} ${fmtDate(report.updated_at, true)}` : "Not entered yet."} The client sees exactly these figures.{client.meta_ad_account_id ? " Synced daily from Meta; manual edits are replaced on the next sync." : ""}</p>
        </div>
        <form className="flex items-center gap-2">
          <input type="hidden" name="tab" value="reporting" />
          <label htmlFor="month" className="sr-only">Month</label>
          <select id="month" name="month" defaultValue={current.start} className="h-9 rounded-control border border-field bg-white px-2.5 text-[13px]">
            {options.map((o) => <option key={o.start} value={o.start}>{o.label}</option>)}
          </select>
          <button className="h-9 rounded-control border border-field px-3 text-[13px] font-medium hover:bg-[#F4F5F2]">Show</button>
        </form>
      </div>
      <AdReportForm key={current.start} clientId={client.id} month={current.start} report={report} trackedInquiries={count ?? 0} />
      {client.meta_ad_account_id && (
        <Section title={`Ads in Meta · ${ads.length}`}>
          <p className="-mt-1 text-[13px] text-slate">Running, paused and in-review ads from the client&apos;s ad account, with the last 30 days of results. Synced daily and with &ldquo;Sync now&rdquo;. The client sees these on their Advertising tab.</p>
          {ads.length ? <MetaAdsGrid ads={ads} /> : <p className="text-[13px] text-slate">No ads synced yet. Use Sync now under Connections → Facebook &amp; Instagram.</p>}
        </Section>
      )}
      {(recent ?? []).length > 0 && (
        <Section title="Earlier months">
          <RowList>
            {(recent ?? []).map((r) => (
              <Row key={r.month} href={`/admin/clients/${client.id}?tab=reporting&month=${r.month}`}>
                <span className="flex-1 font-medium">{monthBounds(0, new Date(r.month + "T00:00:00Z")).label}</span>
                <span className="text-[13px] tabular-nums text-body">{money(Number(r.meta_spend))} · {r.meta_inquiries} inquiries</span>
              </Row>
            ))}
          </RowList>
        </Section>
      )}
      <p className="text-xs text-slate">Website visitors come straight from Vercel once the website project is picked in Connections.</p>
    </>
  );
}
