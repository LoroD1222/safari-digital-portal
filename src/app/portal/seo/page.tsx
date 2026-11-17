import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { loadSeo } from "@/lib/seo";
import { planMonth } from "@/lib/seo-plan";
import { todayTz } from "@/lib/invoices";
import { SeoReport } from "@/components/seo-report";
import { SeoBacklinks } from "@/components/seo-backlinks";
import { Tabs } from "@/components/blocks";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "SEO" };

export default async function SeoPage(props: PageProps<"/portal/seo">) {
  const { company } = await getPortalContext();
  if (!company) redirect("/portal");
  if (!company.seo_enabled) redirect("/portal");
  const sp = await props.searchParams;
  const view = sp.view === "backlinks" ? "backlinks" : "results";
  const data = await loadSeo(await createClient(), company.id);
  const today = todayTz();
  const current = planMonth(data.plan, today.slice(0, 8) + "01");
  const total = data.plan.months.length;
  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">SEO</h1>
        <p className="text-body">
          {current ? <>Month {current.month_no} of {total}{current.title ? <> · <span className="font-medium text-ink">{current.title}</span></> : null}. </> : null}
          How your website is doing on Google, and what we&apos;re working on.
        </p>
      </div>
      {!data.ready ? <EmptyState title="SEO is almost ready" body="Safari Digital is finishing setting it up. Check back soon." /> : (
        <>
          <Tabs label="SEO sections" items={[
            { href: "/portal/seo", label: "Results", active: view === "results" },
            { href: "/portal/seo?view=backlinks", label: "Backlinks", active: view === "backlinks", count: 0 },
          ]} />
          {view === "results"
            ? <SeoReport data={data} connected={!!company.gsc_site} site={company.gsc_site} />
            : <SeoBacklinks data={data} month={typeof sp.month === "string" ? sp.month : null} base="/portal/seo?view=backlinks" today={today} />}
        </>
      )}
    </>
  );
}
