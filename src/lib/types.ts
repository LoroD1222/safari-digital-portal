export type Role = "admin" | "client";
export type OnboardingStatus = "not_started" | "in_progress" | "submitted" | "being_reviewed" | "setup_complete";
export type AccountStatus = "invited" | "active" | "paused";
export type MarketingPackage = "growth" | "scale" | "partner";
export type WebsitePackage = "landing_page" | "tour_operator" | "advanced";

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
  tracking_since?: string | null;
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
  growth: "Growth",
  scale: "Scale",
  partner: "Marketing Partner",
};

export const WEBSITE_LABEL: Record<WebsitePackage, string> = {
  landing_page: "Landing Page",
  tour_operator: "Tour Operator Website",
  advanced: "Advanced Website",
};

// List price, used as the suggested monthly price / one-time fee (USD). null = custom.
export const MARKETING_PRICE: Record<MarketingPackage, number | null> = { growth: 440, scale: 770, partner: null };
export const WEBSITE_PRICE: Record<WebsitePackage, number | null> = { landing_page: 195, tour_operator: 820, advanced: null };

// What's included, shown on the client's Account page.
export const MARKETING_FEATURES: Record<MarketingPackage, string[]> = {
  growth: ["Facebook & Instagram ads, managed for you", "International targeting strategy", "Campaign setup and optimization", "4 ad creatives a month, with copywriting", "Meta Pixel, conversion tracking and retargeting", "Monthly report"],
  scale: ["Everything in Growth", "TikTok Ads management", "ChatGPT ads where available", "8 ad creatives a month", "Advanced testing and cross-platform optimization", "Landing page conversion recommendations", "Monthly strategy call and detailed reports"],
  partner: ["Everything in Scale, tailored to you", "Multi-channel advertising and funnels", "CRM, WhatsApp and email automations", "Custom landing pages and advanced analytics", "Dedicated strategy and support"],
};
export const WEBSITE_FEATURES: Record<WebsitePackage, string[]> = {
  landing_page: ["Single-page, mobile-friendly website", "Tour or offer showcase", "WhatsApp and inquiry form", "Design focused on conversions", "Basic SEO", "Two rounds of revisions"],
  tour_operator: ["Up to 6 pages and 5 safari itineraries", "Easy-to-use CMS", "Galleries, reviews and inquiry forms", "SEO, speed, Meta Pixel and analytics", "Four rounds of revisions and website training"],
  advanced: ["Custom website design", "Advanced tour management", "Search, filters and multiple languages", "Booking and CRM integrations", "Custom features and automations"],
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
export type ContentKind = "reel" | "post" | "story" | "ad" | "carousel";
export type Platform = "instagram" | "facebook" | "both";
export type ContentItem = {
  id: string; client_id: string; title: string; caption: string | null; kind: ContentKind; platform: Platform;
  status: ContentStatus; scheduled_for: string | null; published_at: string | null; media_path: string | null;
  media_type: string | null; version: number; created_at: string; updated_at: string;
  as_ad?: boolean;
  extra_media?: Slide[];
};
export type Slide = { path: string; type: string };
export type SignedSlide = { url: string; type: string };

// Ads synced from a client's Meta ad account.
export type MetaAd = {
  id: string; client_id: string; name: string; status: string; format: "image" | "video" | "carousel";
  title: string | null; body: string | null; link: string | null; cta: string | null; image_url: string | null;
  cards: { image_url: string | null; title: string | null; link: string | null }[]; preview_url: string | null;
  spend: number; impressions: number; clicks: number; inquiries: number; created_time: string | null; synced_at: string;
};
export type ContentComment = {
  id: string; content_id: string; author_role: Role; kind: "comment" | "changes_requested" | "approved" | "revision" | "sent";
  body: string | null; version: number; created_at: string;
};
export const CONTENT_LABEL: Record<ContentStatus, string> = {
  draft: "Draft", awaiting_approval: "Awaiting approval", changes_requested: "Changes requested",
  approved: "Approved", scheduled: "Scheduled", published: "Published",
};
export const KIND_LABEL: Record<ContentKind, string> = { reel: "Reel", post: "Post", story: "Story", ad: "Ad", carousel: "Carousel" };
export const PLATFORM_LABEL: Record<Platform, string> = { instagram: "Instagram", facebook: "Facebook", both: "Facebook & Instagram" };

// ───────────── Inquiries ─────────────
export type InquirySource = "meta_ads" | "meta_organic" | "website" | "direct" | "unknown";
export type InquiryStatus = "new" | "contacted" | "quoted" | "negotiating" | "booked" | "closed";
export type Inquiry = {
  id: string; client_id: string; customer_name: string; email: string | null; phone: string | null; country: string | null;
  interested_in: string | null; travel_dates: string | null; travellers: string | null; message: string | null;
  source: InquirySource; campaign: string | null; channel: string; status: InquiryStatus; received_at: string; origin: string;
  // Pipeline (0018): USD value, next follow-up, private notes, why it was lost, when it entered its stage.
  trip_value?: number | null; follow_up_on?: string | null; notes?: string | null; lost_reason?: string | null; stage_changed_at?: string | null;
};
// Pipeline order. "closed" is shown as Lost.
export const STAGES: InquiryStatus[] = ["new", "contacted", "quoted", "negotiating", "booked", "closed"];
export const OPEN_STAGES: InquiryStatus[] = ["new", "contacted", "quoted", "negotiating"];
export const LOST_REASONS = ["Price too high", "Dates didn't work", "No reply", "Chose another operator", "Changed plans", "Other"];
// After this many days in one stage, a card is flagged as waiting too long.
export const STALE_DAYS: Partial<Record<InquiryStatus, number>> = { new: 1, contacted: 3, quoted: 5, negotiating: 7 };
export const SOURCE_LABEL: Record<InquirySource, string> = {
  meta_ads: "Facebook & Instagram Ads", meta_organic: "Facebook & Instagram Organic", website: "Website", direct: "WhatsApp / Direct", unknown: "Other / Unknown",
};
export const INQUIRY_LABEL: Record<InquiryStatus, string> = { new: "New", contacted: "Contacted", quoted: "Quote sent", negotiating: "Negotiating", booked: "Booked", closed: "Lost" };
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
// leads/chats are filled by the Meta sync; manual reports only have inquiries.
export type Campaign = { name: string; status: "active" | "paused" | "ended"; spend: number; inquiries: number; leads?: number; chats?: number };

// Chats started from ads (Instagram DM, Messenger, WhatsApp) for a report, or null if unknown.
export function adChats(campaigns: Campaign[] | null | undefined) {
  const list = campaigns ?? [];
  if (!list.some((c) => typeof c.chats === "number")) return null;
  return list.reduce((n, c) => n + (c.chats ?? 0), 0);
}
export type AdReport = {
  id: string; client_id: string; month: string; meta_spend: number; meta_inquiries: number; campaigns: Campaign[];
  note: string | null; source: "manual" | "synced"; updated_at: string;
};

// ───────────── Billing (admin only) ─────────────
export type Currency = "USD" | "TZS";
export type DiscountType = "percent" | "amount";
export type ClientPrivate = {
  client_id: string; monthly_fee: number | null; currency: Currency; billing_start: string | null; notes: string | null;
  discount_type?: DiscountType; discount_value?: number | null;
  website_fee?: number | null; website_discount_type?: DiscountType; website_discount_value?: number | null;
  website_built_on?: string | null; // first day of the month the website was built
};

// List price minus a discount (percent or fixed amount), never below zero.
export function discounted(list: number, type: DiscountType, value: number) {
  const v = Math.max(0, Number(value) || 0);
  const off = type === "percent" ? (list * Math.min(v, 100)) / 100 : v;
  return Math.max(0, Math.round((list - off) * 100) / 100);
}

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
    // Every invited client counts towards the total, including ones starting later.
    // The monthly chart (mrrHistory) still uses each client's start date.
    totals[b.currency] = (totals[b.currency] ?? 0) + fee;
    if (startOf(b, c) > today) upcoming++; else paying++;
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
    // The current month only counts what has started by today (the MRR card also includes clients starting later).
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

// ───────────── Invoices ─────────────
export type InvoiceStatus = "draft" | "sent" | "paid" | "cancelled";
export type InvoiceItem = { description: string; details?: string | null; amount: number };
export type Invoice = {
  id: string; client_id: string; number: string; kind: "monthly" | "one_off"; period_month: string | null;
  status: InvoiceStatus; currency: Currency; issue_date: string; due_date: string; items: InvoiceItem[]; total: number;
  notes: string | null; sent_at: string | null; paid_at: string | null; payment_method: string | null; payment_ref: string | null;
  reminder_sent_at: string | null; overdue_sent_at: string | null; created_at: string;
};
export const INVOICE_LABEL: Record<InvoiceStatus | "overdue", string> = { draft: "Needs approval", sent: "Unpaid", paid: "Paid", cancelled: "Cancelled", overdue: "Overdue" };
export const INVOICE_TONE = { draft: "neutral", sent: "blue", paid: "green", cancelled: "neutral", overdue: "red" } as const;

// "Overdue" isn't stored: it's a sent invoice past its due date (Tanzania time).
export function invoiceState(i: Pick<Invoice, "status" | "due_date">, now = new Date()): InvoiceStatus | "overdue" {
  const today = new Date(now.getTime() + 3 * 3600e3).toISOString().slice(0, 10);
  return i.status === "sent" && i.due_date < today ? "overdue" : i.status;
}
export function invoiceTotal(items: InvoiceItem[]) {
  return Math.round(items.reduce((n, i) => n + (Number(i.amount) || 0), 0) * 100) / 100;
}
