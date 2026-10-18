export type Role = "admin" | "client";
export type OnboardingStatus = "not_started" | "in_progress" | "submitted" | "being_reviewed" | "setup_complete";
export type AccountStatus = "invited" | "active" | "paused";
export type MarketingPackage = "starter" | "core" | "elite";
export type WebsitePackage = "full_build";

export type Client = {
  id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  whatsapp: string | null;
  website_url: string | null;
  marketing_package: MarketingPackage | null;
  website_package: WebsitePackage | null;
  onboarding_status: OnboardingStatus;
  account_status: AccountStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export const ONBOARDING_LABEL: Record<OnboardingStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
  being_reviewed: "Being reviewed",
  setup_complete: "Setup complete",
};

export const ACCOUNT_LABEL: Record<AccountStatus, string> = {
  invited: "Invited",
  active: "Active",
  paused: "Paused",
};

export const MARKETING_LABEL: Record<MarketingPackage, string> = {
  starter: "Starter",
  core: "Core",
  elite: "Elite",
};

export const WEBSITE_LABEL: Record<WebsitePackage, string> = {
  full_build: "Full Build",
};

export function packageSummary(c: Pick<Client, "marketing_package" | "website_package">) {
  const parts: string[] = [];
  if (c.marketing_package) parts.push(`Marketing ${MARKETING_LABEL[c.marketing_package]}`);
  if (c.website_package) parts.push(`Website ${WEBSITE_LABEL[c.website_package]}`);
  return parts.length ? parts.join(" + ") : "No package yet";
}
