import type { Metadata } from "next";
import { getPortalContext } from "@/lib/portal";
import { ONBOARDING_LABEL, packageSummary } from "@/lib/types";
import { ONBOARDING_TONE } from "@/lib/status-tone";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Overview" };

export default async function PortalOverview() {
  const { company } = await getPortalContext();
  if (!company) {
    return (
      <>
        <PageHeader title="Welcome" />
        <EmptyState
          title="Your account is almost ready"
          body="Safari Digital still needs to link your sign-in to your company. You'll see your dashboard here as soon as that's done."
        />
      </>
    );
  }
  return (
    <>
      <PageHeader title={`Welcome, ${company.name}`} subtitle="Your marketing, website and inquiries will appear here as we set them up." />
      <Card className="flex flex-col gap-3 px-5 py-[18px]">
        <h2 className="text-[15px] font-semibold">Your package</h2>
        <p>{packageSummary(company)}</p>
        <div className="flex items-center gap-2 text-[13px] text-slate">
          Onboarding <Badge tone={ONBOARDING_TONE[company.onboarding_status]}>{ONBOARDING_LABEL[company.onboarding_status]}</Badge>
        </div>
      </Card>
    </>
  );
}
