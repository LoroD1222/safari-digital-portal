import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_ANSWERS, type Answers } from "@/lib/onboarding";
import { listOnboardingFiles } from "@/lib/client-files";
import { Wizard } from "./wizard";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Onboarding" };

function merge(saved: Answers | null): Answers {
  const s = saved ?? {};
  return {
    business: { ...DEFAULT_ANSWERS.business, ...s.business },
    marketing: { ...DEFAULT_ANSWERS.marketing, ...s.marketing },
    website: { ...DEFAULT_ANSWERS.website, ...s.website },
    files: { ...DEFAULT_ANSWERS.files, ...s.files, mode: "drive" },
  };
}

export default async function OnboardingPage() {
  const { company } = await getPortalContext();
  if (!company) redirect("/portal");

  const supabase = await createClient();
  const { data: row } = await supabase.from("onboarding_responses").select("data, submitted_at").eq("client_id", company.id).maybeSingle();
  const files = await listOnboardingFiles(supabase, company.id);
  const settings = await getSettings();
  const started = !!row && Object.keys(row.data ?? {}).length > 0;

  return (
    <Wizard
      clientId={company.id}
      companyName={company.name}
      services={{ marketing: !!company.marketing_package, website: !!company.website_package }}
      initialAnswers={merge((row?.data as Answers) ?? null)}
      initialFiles={files}
      initialStep={row?.submitted_at ? "done" : started ? "business" : "welcome"}
      metaBusinessId={settings.meta_business_id}
      driveShareEmail={settings.drive_share_email}
      metaAccessVideoUrl={settings.meta_video_url}
      driveTutorialVideoUrl={settings.drive_video_url}
    />
  );
}
