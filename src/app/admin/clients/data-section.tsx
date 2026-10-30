import { Badge } from "@/components/ui";
import { listProjects, monthRange, vercelConfigured, websiteStats } from "@/lib/vercel";
import type { Client } from "@/lib/types";
import { VercelProjectPicker } from "./data-connections";
import { FollowupSenderForm, MetaEventsForm, MetaForm } from "./manage-forms";
import { createClient } from "@/lib/supabase/server";
import { fmtDateTime } from "@/lib/dates";
import { createInquiryKey } from "./manage-actions";
import { CopyButton } from "@/components/copy-button";
import { siteOrigin } from "@/lib/origin";
import { listAdAccounts, metaConfigured } from "@/lib/meta";
import { trackerStats } from "@/lib/site-stats";
import { createAdminClient } from "@/lib/supabase/admin";

function Card({ title, what, status, children }: { title: string; what: string; status: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5"><span className="font-semibold">{title}</span><span className="text-[13px] text-slate">{what}</span></div>
        {status}
      </div>
      {children}
    </div>
  );
}

export async function DataSection({ client }: { client: Client }) {
  const configured = vercelConfigured();
  const meta = metaConfigured() ? await listAdAccounts() : null;
  const projects = configured ? await listProjects() : null;
  const linked = client.vercel_project_id ?? null;
  const month = monthRange(0);
  const stats = configured && linked ? await websiteStats(linked, month) : null;

  return (
    <section aria-labelledby="dc-h" className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 id="dc-h" className="text-[15px] font-semibold">Data connections</h2>
        <p className="text-[13px] text-slate">Where this client&apos;s numbers come from.</p>
      </div>

      <Card title="Website analytics (Vercel)" what="For websites hosted on Vercel. For WordPress and other sites, use the Safari Digital snippet below."
        status={linked && stats?.ok ? <Badge tone="green">Connected</Badge> : linked ? <Badge tone="amber">Check connection</Badge> : <Badge>Not connected</Badge>}>
        {!configured ? (
          <p className="text-[13px] text-body">Vercel isn&apos;t connected to the portal yet. Add an <code className="rounded bg-sidebar px-1">ANALYTICS_VERCEL_TOKEN</code> in Vercel&apos;s Environment Variables, then redeploy.</p>
        ) : projects && !projects.ok ? (
          <p className="text-[13px] text-danger-text">{projects.error}</p>
        ) : (
          <>
            <VercelProjectPicker clientId={client.id} current={linked} projects={projects?.ok ? projects.data : []} />
            {stats && (stats.ok
              ? <p className="text-[13px] text-slate">{month.label}: <span className="font-medium text-ink">{stats.data.visitors.toLocaleString("en-US")} visitors</span> · {stats.data.pageviews.toLocaleString("en-US")} page views</p>
              : <p className="text-[13px] text-danger-text">{stats.error}</p>)}
          </>
        )}
      </Card>

      <InquiryFormCard client={client} />

      <SnippetCard client={client} />

      <FollowupCard client={client} />

      <Card title="Facebook & Instagram" what="Access to the client's Meta Business Suite"
        status={client.meta_access_confirmed ? <Badge tone="green">Access confirmed</Badge> : <Badge tone="amber">Not confirmed</Badge>}>
        <MetaForm client={client} accounts={meta?.ok ? meta.data : null} accountsError={meta && !meta.ok ? meta.error : null} />
        {!meta && <p className="text-[13px] text-slate">Add META_SYSTEM_USER_TOKEN in Vercel to sync ad results automatically. Until then, enter them monthly in the Reporting tab.</p>}
      </Card>

      <MetaEventsCard client={client} />
    </section>
  );
}

async function InquiryFormCard({ client }: { client: Client }) {
  const key = client.inquiry_form_key;
  const endpoint = `${process.env.PORTAL_URL?.replace(/\/$/, "") || (await siteOrigin())}/api/inquiries`;
  const html = `<form action="${endpoint}" method="POST">
  <input type="hidden" name="key" value="${key}">
  <input type="hidden" name="redirect" value="https://YOUR-SITE/thank-you">
  <input name="name" placeholder="Name" required>
  <input name="email" type="email" placeholder="Email">
  <input name="phone" placeholder="WhatsApp">
  <input name="interested_in" placeholder="Which safari?">
  <input name="travel_dates" placeholder="Travel dates">
  <input name="travellers" placeholder="Travellers">
  <textarea name="message"></textarea>
  <input name="_gotcha" tabindex="-1" autocomplete="off" style="display:none">
  <button>Send inquiry</button>
</form>`;
  const js = `// Next.js / React. On every page load, keep the ad tracking from the URL:
//   const p = new URLSearchParams(location.search);
//   const keep = ["utm_source", "utm_medium", "utm_campaign", "fbclid"];
//   const found = Object.fromEntries(keep.filter((k) => p.get(k)).map((k) => [k, p.get(k)]));
//   if (Object.keys(found).length) sessionStorage.setItem("utm", JSON.stringify(found));
// Then send the form with it, plus Meta's cookies:
const cookie = (n) => document.cookie.match(new RegExp("(?:^|; )" + n + "=([^;]*)"))?.[1];
await fetch("${endpoint}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    key: "${key}",
    name, email, phone, country, interested_in, travel_dates, travellers, message,
    ...JSON.parse(sessionStorage.getItem("utm") ?? "{}"),
    fbc: cookie("_fbc"), fbp: cookie("_fbp"),
  }),
});`;
  return (
    <Card title="Website inquiry form" what="The client's website form sends inquiries straight into the portal"
      status={key ? <Badge tone="green">Ready</Badge> : <Badge>Not set up</Badge>}>
      {!key ? (
        <form action={createInquiryKey.bind(null, client.id)} className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-[13px] text-body">Create a form key, then add it to the client&apos;s website form.</p>
          <button className="h-9 rounded-control border border-field bg-white px-3.5 text-[13px] font-medium hover:bg-[#F4F5F2]">Create form key</button>
        </form>
      ) : (
        <div className="flex flex-col gap-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-slate">Send to</span>
            <code className="min-w-0 flex-1 truncate rounded bg-sidebar px-2 py-1">{endpoint}</code>
            <CopyButton text={endpoint} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 text-slate">Form key</span>
            <code className="min-w-0 flex-1 truncate rounded bg-sidebar px-2 py-1">{key}</code>
            <CopyButton text={key} />
          </div>
          <details className="rounded-control border border-line-soft px-3 py-2">
            <summary className="cursor-pointer font-medium">How to connect the form</summary>
            <div className="mt-2 flex flex-col gap-3 text-body">
              <p>Fields: <code>name</code> and <code>email</code> or <code>phone</code> are required; <code>interested_in</code>, <code>travel_dates</code>, <code>travellers</code>, <code>country</code>, <code>message</code> are optional. Pass <code>utm_source</code>, <code>utm_medium</code> and <code>utm_campaign</code> to record which ad it came from: <code>utm_source=facebook</code> or <code>instagram</code> with <code>utm_medium=paid</code> counts as <em>Facebook &amp; Instagram ads</em>. Also pass <code>fbclid</code> from the URL and the <code>_fbc</code> / <code>_fbp</code> cookies (as <code>fbc</code>, <code>fbp</code>) so Meta can match the inquiry to the ad click.</p>
              <div className="flex items-center justify-between"><span className="font-medium">Plain HTML form</span><CopyButton text={html} /></div>
              <pre className="overflow-x-auto rounded bg-sidebar p-3 text-xs">{html}</pre>
              <div className="flex items-center justify-between"><span className="font-medium">From code (fetch)</span><CopyButton text={js} /></div>
              <pre className="overflow-x-auto rounded bg-sidebar p-3 text-xs">{js}</pre>
            </div>
          </details>
          <form action={createInquiryKey.bind(null, client.id)}>
            <button className="text-[13px] font-medium text-slate hover:text-ink">Replace key (the old one stops working)</button>
          </form>
        </div>
      )}
    </Card>
  );
}

const EVENT_TONE = { sent: "green", failed: "red", pending: "amber", skipped: "neutral" } as const;
const EVENT_LABEL = { sent: "Sent", failed: "Failed", pending: "Sending", skipped: "Skipped" } as const;

type EventRow = { id: string; event_name: string; status: keyof typeof EVENT_TONE; error: string | null; created_at: string; inquiries: { customer_name: string } | null };

async function MetaEventsCard({ client }: { client: Client }) {
  const dataset = client.meta_dataset_id ?? null;
  const supabase = await createClient();
  const { data, error } = dataset
    ? await supabase.from("meta_events").select("id, event_name, status, error, created_at, inquiries(customer_name)").eq("client_id", client.id).order("created_at", { ascending: false }).limit(8)
    : { data: null, error: null };
  const events = (data ?? []) as unknown as EventRow[];
  const { data: priv } = await supabase.from("client_private").select("meta_capi_token").eq("client_id", client.id).maybeSingle();
  const hasToken = !!(priv as { meta_capi_token?: string | null } | null)?.meta_capi_token;
  const failing = events.length > 0 && events[0].status === "failed";
  return (
    <Card title="Lead events to Meta" what="New inquiries and status changes (Lead → Contacted → Booked) go to the client's Meta dataset, so ads learn what brings bookings"
      status={!dataset ? <Badge>Off</Badge> : failing ? <Badge tone="red">Check connection</Badge> : <Badge tone="green">On</Badge>}>
      {!metaConfigured() && !hasToken && <p className="text-[13px] text-danger-text">Add META_SYSTEM_USER_TOKEN in Vercel, or save a dataset access token below.</p>}
      <MetaEventsForm clientId={client.id} datasetId={dataset} hasToken={hasToken} />
      {error && <p className="text-[13px] text-danger-text">Run 0008_meta_events.sql in Supabase to see sent events.</p>}
      {dataset && !error && (
        events.length === 0 ? <p className="text-[13px] text-slate">No events yet. They appear here when an inquiry comes in or its status changes.</p> : (
          <ul className="flex flex-col text-[13px]">
            {events.map((e, i) => (
              <li key={e.id} className={"flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 " + (i ? "border-t border-line-soft" : "")}>
                <span className="w-20 font-medium">{e.event_name}</span>
                <span className="min-w-0 flex-1 truncate">{e.inquiries?.customer_name ?? "Deleted inquiry"}</span>
                <span className="text-slate">{fmtDateTime(e.created_at)}</span>
                <Badge tone={EVENT_TONE[e.status]}>{EVENT_LABEL[e.status]}</Badge>
                {e.error && e.status !== "sent" && <span className="basis-full text-xs text-slate">{e.error}</span>}
              </li>
            ))}
          </ul>
        )
      )}
    </Card>
  );
}

// One script tag for WordPress, Wix, Squarespace… counts visitors and sends every form to Inquiries.
async function SnippetCard({ client }: { client: Client }) {
  const key = client.inquiry_form_key;
  const base = process.env.PORTAL_URL?.replace(/\/$/, "") || (await siteOrigin());
  const tag = key ? `<script src="${base}/s.js" data-key="${key}" defer></script>` : "";
  const since = client.tracking_since;
  const month = monthRange(0);
  const stats = since ? await trackerStats(client.id, month) : null;
  const { data: last } = since
    ? await createAdminClient().from("page_views").select("at").eq("client_id", client.id).order("at", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  return (
    <Card title="Website snippet (WordPress & other sites)" what="One line of code on the client's website: counts visitors and sends every contact form into Inquiries"
      status={since ? <Badge tone="green">Receiving visits</Badge> : key ? <Badge tone="amber">Not installed yet</Badge> : <Badge>Needs a form key</Badge>}>
      {!key ? (
        <p className="text-[13px] text-body">Create a form key in the &ldquo;Website inquiry form&rdquo; card above first. The snippet uses the same key.</p>
      ) : (
        <div className="flex flex-col gap-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-sidebar px-2 py-1.5">{tag}</code>
            <CopyButton text={tag} label="Copy snippet" />
          </div>
          {since && stats?.ok && (
            <p className="text-slate">
              {month.label}: <span className="font-medium text-ink">{stats.data.visitors.toLocaleString("en-US")} visitors</span> · {stats.data.pageviews.toLocaleString("en-US")} page views
              {last?.at ? <> · last visit {fmtDateTime(last.at)}</> : null}
            </p>
          )}
          <details className="rounded-control border border-line-soft px-3 py-2" open={!since}>
            <summary className="cursor-pointer font-medium">How to add it to WordPress (5 minutes)</summary>
            <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-body">
              <li>In WordPress, go to <strong>Plugins → Add New</strong>, search <strong>WPCode</strong> (&ldquo;Insert Headers and Footers&rdquo;), then <strong>Install</strong> and <strong>Activate</strong>.</li>
              <li>Go to <strong>Code Snippets → Header &amp; Footer</strong>.</li>
              <li>Paste the snippet into the <strong>Footer</strong> box and click <strong>Save Changes</strong>.</li>
              <li>If the site uses a cache plugin (WP Rocket, LiteSpeed, W3 Total Cache…), click <strong>Clear cache</strong>.</li>
              <li>Open the website in a private window. This card turns green within a minute.</li>
              <li>Test the contact form with your own details. The inquiry appears in the portal right away.</li>
            </ol>
            <p className="mt-2 text-slate">Works with Contact Form 7, WPForms, Elementor, Gravity Forms, Fluent Forms and most others. Search boxes and login forms are ignored. Wix / Squarespace: Settings → Custom code → add to all pages, body end.</p>
          </details>
        </div>
      )}
    </Card>
  );
}

// Follow-up emails to guests go from the client's own address (a domain verified in Resend).
async function FollowupCard({ client }: { client: Client }) {
  const supabase = await createClient();
  const [{ data: fs, error }, { count: onRules }, { count: sent }] = await Promise.all([
    supabase.from("followup_settings").select("*").eq("client_id", client.id).maybeSingle(),
    supabase.from("followup_rules").select("id", { count: "exact", head: true }).eq("client_id", client.id).eq("enabled", true),
    supabase.from("followup_sends").select("id", { count: "exact", head: true }).eq("client_id", client.id).eq("status", "sent"),
  ]);
  const ready = !!fs?.sender_ready && !!fs?.from_email;
  return (
    <Card title="Follow-up emails" what="Automatic reminders to guests who haven't replied, sent from the client's own address"
      status={error ? <Badge tone="amber">Run 0020_followups.sql</Badge> : ready ? <Badge tone="green">Sender ready</Badge> : fs?.from_email ? <Badge tone="amber">Domain not verified</Badge> : <Badge>Not set up</Badge>}>
      {!error && (
        <>
          <p className="text-[13px] text-body">
            The client has follow-ups <span className="font-medium text-ink">{fs?.enabled ? "on" : "off"}</span>
            {fs?.enabled ? ` · ${onRules ?? 0} switched on` : ""} · {sent ?? 0} sent so far.
            {" "}To set up: add the client&apos;s domain in Resend (Domains), give them the DNS records, then enter the address here once it shows Verified.
          </p>
          <FollowupSenderForm clientId={client.id} email={fs?.from_email ?? null} name={fs?.from_name ?? null} clientName={client.name} />
        </>
      )}
    </Card>
  );
}
