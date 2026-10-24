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
  vercel_project_id?: string | null;
  vercel_project_name?: string | null;
  meta_ad_account_id?: string | null;
  meta_dataset_id?: string | null;
  meta_page_id?: string | null;
  plan_reels?: number | null;
  plan_posts?: number | null;
  website_stage?: WebsiteStage;
  website_preview_url?: string | null;
  cms_url?: string | null;
  design_review?: "pending" | "approved" | "changes_requested" | null;
  design_feedback?: string | null;
  meta_access_confirmed?: boolean;
  onboarding_note?: string | null;
  inquiry_form_key?: string | null;
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

// ───────────── Website project ─────────────
export type WebsiteStage = "info_received" | "design" | "awaiting_approval" | "development" | "live";
export const WEBSITE_STAGES: { key: WebsiteStage; label: string }[] = [
  { key: "info_received", label: "Information received" },
  { key: "design", label: "Design in progress" },
  { key: "awaiting_approval", label: "Awaiting your approval" },
  { key: "development", label: "Development" },
  { key: "live", label: "Website launched" },
];
export const STAGE_LABEL = Object.fromEntries(WEBSITE_STAGES.map((s) => [s.key, s.label])) as Record<WebsiteStage, string>;

// ───────────── Content ─────────────
export type ContentStatus = "draft" | "awaiting_approval" | "changes_requested" | "approved" | "scheduled" | "published";
export type ContentKind = "reel" | "post" | "story";
export type Platform = "instagram" | "facebook" | "both";
export type ContentItem = {
  id: string; client_id: string; title: string; caption: string | null; kind: ContentKind; platform: Platform;
  status: ContentStatus; scheduled_for: string | null; published_at: string | null; media_path: string | null;
  media_type: string | null; version: number; created_at: string; updated_at: string;
};
export type ContentComment = {
  id: string; content_id: string; author_role: Role; kind: "comment" | "changes_requested" | "approved" | "revision" | "sent";
  body: string | null; version: number; created_at: string;
};
export const CONTENT_LABEL: Record<ContentStatus, string> = {
  draft: "Draft", awaiting_approval: "Awaiting approval", changes_requested: "Changes requested",
  approved: "Approved", scheduled: "Scheduled", published: "Published",
};
export const KIND_LABEL: Record<ContentKind, string> = { reel: "Reel", post: "Post", story: "Story" };
export const PLATFORM_LABEL: Record<Platform, string> = { instagram: "Instagram", facebook: "Facebook", both: "Facebook & Instagram" };

// ───────────── Inquiries ─────────────
export type InquirySource = "meta_ads" | "meta_organic" | "website" | "direct" | "unknown";
export type InquiryStatus = "new" | "contacted" | "booked" | "closed";
export type Inquiry = {
  id: string; client_id: string; customer_name: string; email: string | null; phone: string | null; country: string | null;
  interested_in: string | null; travel_dates: string | null; travellers: string | null; message: string | null;
  source: InquirySource; campaign: string | null; channel: string; status: InquiryStatus; received_at: string; origin: string;
};
export const SOURCE_LABEL: Record<InquirySource, string> = {
  meta_ads: "Facebook & Instagram Ads", meta_organic: "Facebook & Instagram Organic", website: "Website", direct: "WhatsApp / Direct", unknown: "Other / Unknown",
};
export const INQUIRY_LABEL: Record<InquiryStatus, string> = { new: "New", contacted: "Contacted", booked: "Booked", closed: "Closed" };
export const CHANNEL_LABEL: Record<string, string> = {
  website_form: "Website form", meta_lead_form: "Meta lead form", whatsapp: "WhatsApp", facebook_message: "Facebook message",
  instagram_message: "Instagram message", email: "Email", phone: "Phone", other: "Other",
};

// ───────────── Requests ─────────────
export type RequestStatus = "submitted" | "in_progress" | "waiting_for_client" | "completed";
export type RequestCategory = "website_change" | "support" | "problem";
export type SupportRequest = {
  id: string; client_id: string; category: RequestCategory; subject: string; status: RequestStatus;
  last_message_at: string; last_message_role: Role; created_at: string;
};
export type RequestMessage = {
  id: string; request_id: string; author_role: Role; body: string; attachment_path: string | null;
  attachment_name: string | null; created_at: string;
};
export const REQUEST_LABEL: Record<RequestStatus, string> = {
  submitted: "Submitted", in_progress: "In progress", waiting_for_client: "Waiting for you", completed: "Completed",
};
export const REQUEST_LABEL_ADMIN: Record<RequestStatus, string> = { ...REQUEST_LABEL, waiting_for_client: "Waiting for client" };
export const CATEGORY_LABEL: Record<RequestCategory, string> = {
  website_change: "Website change", support: "Question or help", problem: "Something isn't working",
};

// ───────────── Ads ─────────────
export type Campaign = { name: string; status: "active" | "paused" | "ended"; spend: number; inquiries: number };
export type AdReport = {
  id: string; client_id: string; month: string; meta_spend: number; meta_inquiries: number; campaigns: Campaign[];
  note: string | null; source: "manual" | "synced"; updated_at: string;
};

// ───────────── Billing (admin only) ─────────────
export type Currency = "USD" | "TZS";
export type ClientPrivate = { client_id: string; monthly_fee: number | null; currency: Currency; billing_start: string | null; notes: string | null };

export function formatMoney(amount: number, currency: Currency) {
  if (currency === "TZS") {
    return "TZS " + (amount >= 1_000_000 ? (amount / 1_000_000).toFixed(amount % 1_000_000 ? 1 : 0) + "M" : amount.toLocaleString("en-US"));
  }
  return "$" + amount.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// Clients we bill: everyone except paused accounts. "Invited" clients pay too,
// they just haven't logged in yet.
const billable = (c: Pick<Client, "account_status">) => c.account_status !== "paused";

function startOf(b: ClientPrivate, c: Pick<Client, "created_at">) {
  return b.billing_start ?? c.created_at.slice(0, 10);
}

// Monthly recurring revenue today, one total per currency. Prices with a
// start date in the future count as "upcoming", not MRR yet.
export function mrr(clients: Pick<Client, "id" | "account_status" | "created_at">[], billing: ClientPrivate[], now = new Date()) {
  const live = new Map(clients.filter(billable).map((c) => [c.id, c]));
  const today = now.toISOString().slice(0, 10);
  const totals: Partial<Record<Currency, number>> = {};
  let paying = 0, upcoming = 0;
  for (const b of billing) {
    const c = live.get(b.client_id);
    const fee = Number(b.monthly_fee);
    if (!c || !fee || !Number.isFinite(fee)) continue;
    if (startOf(b, c) > today) { upcoming++; continue; }
    totals[b.currency] = (totals[b.currency] ?? 0) + fee;
    paying++;
  }
  return { totals, paying, upcoming, billable: live.size };
}

// MRR per month for the last `months` months: each client's price counts from
// the month they started paying (or were added), unless they're paused now.
export function mrrHistory(
  clients: Pick<Client, "id" | "account_status" | "created_at">[], billing: ClientPrivate[], currency: Currency, months = 12, now = new Date(),
) {
  const live = new Map(clients.filter(billable).map((c) => [c.id, c]));
  const today = now.toISOString().slice(0, 10);
  const out: { month: string; label: string; value: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    // The current month only counts what has started by today, so the last bar matches the MRR card.
    const end = i === 0 ? today : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0)).toISOString().slice(0, 10);
    let value = 0;
    for (const b of billing) {
      const c = live.get(b.client_id);
      const fee = Number(b.monthly_fee);
      if (!c || !fee || !Number.isFinite(fee) || b.currency !== currency) continue;
      if (startOf(b, c) <= end) value += fee;
    }
    out.push({ month: start.toISOString().slice(0, 7), label: start.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }), value });
  }
  return out;
}
