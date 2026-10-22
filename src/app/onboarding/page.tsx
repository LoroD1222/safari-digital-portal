import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_ANSWERS, inferDone, type Answers } from "@/lib/onboarding";
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
    done: s.done ?? inferDone(s),
  };
}

export default async function OnboardingPage() {
  const { company } = await getPortalContext();
  if (!company) redirect("/portal");

  const supabase = await createClient();
  const { data: row } = await supabase.from("onboarding_responses").select("data, submitted_at").eq("client_id", company.id).maybeSingle();
  const settings = await getSettings();
  // Safari Digital asked for more after a submission: open the form again.
  const reopened = company.onboarding_status === "in_progress" || company.onboarding_status === "not_started";

  return (
    <Wizard
      clientId={company.id}
      companyName={company.name}
      contactName={company.contact_name ?? null}
      services={{ marketing: !!company.marketing_package, website: !!company.website_package }}
      initialAnswers={merge((row?.data as Answers) ?? null)}
      initialView={row?.submitted_at && !reopened ? "done" : "hub"}
      submitted={!!row?.submitted_at && !reopened}
      metaConfirmed={!!company.meta_access_confirmed}
      supportWhatsapp={settings.support_whatsapp}
      note={company.onboarding_note ?? null}
      metaBusinessId={settings.meta_business_id}
      driveShareEmail={settings.drive_share_email}
      metaAccessVideoUrl={settings.meta_video_url}
      driveTutorialVideoUrl={settings.drive_video_url}
    />
  );
}
