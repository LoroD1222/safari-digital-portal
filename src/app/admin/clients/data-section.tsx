import { Badge } from "@/components/ui";
import { listProjects, monthRange, vercelConfigured, websiteStats } from "@/lib/vercel";
import type { Client } from "@/lib/types";
import { VercelProjectPicker } from "./data-connections";

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
  const projects = configured ? await listProjects() : null;
  const linked = client.vercel_project_id ?? null;
  const month = monthRange(0);
  const stats = configured && linked ? await websiteStats(linked, month) : null;

  return (
    <section aria-labelledby="dc-h" className="flex flex-col gap-4 border-t border-line-soft pt-6">
      <div className="flex flex-col gap-0.5">
        <h2 id="dc-h" className="text-[15px] font-semibold">Data connections</h2>
        <p className="text-[13px] text-slate">Where this client&apos;s numbers come from.</p>
      </div>

      <Card title="Website analytics" what="Visitors and page views from Vercel Web Analytics"
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

      <Card title="Meta ads" what="Ad spend, results and lead forms from Facebook & Instagram" status={<Badge>Coming next</Badge>}>
        <p className="text-[13px] text-body">Not connected yet. Until it is, enter ad results by hand.</p>
      </Card>
    </section>
  );
}
