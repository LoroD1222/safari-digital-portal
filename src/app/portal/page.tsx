import type { Metadata } from "next";
import { getPortalContext } from "@/lib/portal";
import { ONBOARDING_LABEL, packageSummary } from "@/lib/types";
import { ONBOARDING_TONE } from "@/lib/status-tone";
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from "@/components/ui";
import Link from "next/link";

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
      {(company.onboarding_status === "not_started" || company.onboarding_status === "in_progress") && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-[#F1D9A8] bg-[#FFFAF0] px-4 py-3.5">
          <span className="flex min-w-[220px] flex-1 flex-col">
            <span className="font-semibold">Finish your onboarding</span>
            <span className="text-[13px] text-body">We need a few details and your photos before we can start. Your answers so far are saved.</span>
          </span>
          <ButtonLink href="/onboarding">{company.onboarding_status === "in_progress" ? "Continue" : "Start"}</ButtonLink>
        </div>
      )}
      <Card className="flex flex-col gap-3 px-5 py-[18px]">
        <h2 className="text-[15px] font-semibold">Your package</h2>
        <p>{packageSummary(company)}</p>
        <div className="flex items-center gap-2 text-[13px] text-slate">
          Onboarding <Badge tone={ONBOARDING_TONE[company.onboarding_status]}>{ONBOARDING_LABEL[company.onboarding_status]}</Badge>
          <Link href="/onboarding" className="font-medium text-brand no-underline">View answers</Link>
        </div>
      </Card>
    </>
  );
}
