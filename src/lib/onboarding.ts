// Onboarding questions and helpers, shared by the client wizard and the admin view.

export type Answers = {
  business?: {
    contact_name?: string;
    whatsapp?: string;
    about?: string;
    offers?: string[];
    markets?: string[];
    inquiry_dest?: "whatsapp" | "email" | "both";
    inquiry_email?: string;
  };
  marketing?: {
    instagram?: string;
    facebook?: string;
    no_instagram?: boolean;
    invite_sent?: boolean;
    budget?: string;
    ad_goals?: string[];
    promote?: string;
  };
  website?: {
    current_site?: string;
    domain_choice?: "have" | "need" | "unsure";
    domain?: string;
    registrar?: string;
    wanted_domain?: string;
    goals?: string[];
    pages?: string[];
    likes?: string;
  };
  files?: {
    mode?: "drive" | "upload";
    drive_link?: string;
    drive_shared?: boolean;
    reviews?: string;
  };
};

export const OFFERS = ["Wildlife safaris", "Kilimanjaro treks", "Zanzibar holidays", "Day trips", "Cultural tours", "Lodge or camp"];
export const MARKETS = ["United States", "United Kingdom", "Germany", "France", "Netherlands", "Italy", "Spain"];
export const AD_GOALS = ["More inquiries", "More WhatsApp messages", "Promote a special offer", "Reach new countries"];
export const WEB_GOALS = ["Get more direct inquiries", "Show our safari packages", "Look more professional", "Be found on Google"];
export const PAGES = ["Home", "Safari packages", "Destinations", "About us", "Reviews", "Blog", "Contact"];

export const FILE_CATEGORIES = [
  { key: "logo", label: "Company logo", hint: "PNG, SVG or PDF, the best quality you have", accept: "image/*,.pdf,.svg", multiple: false },
  { key: "media", label: "Safari photos and videos", hint: "Wildlife, vehicles, camps, your team. Select as many as you like", accept: "image/*,video/*", multiple: true },
  { key: "itineraries", label: "Itineraries and brochures", hint: "PDF or Word files you already send to guests", accept: ".pdf,.doc,.docx", multiple: true },
] as const;
export type FileCategory = (typeof FILE_CATEGORIES)[number]["key"];
export type StoredFile = { path: string; name: string; category: FileCategory };

export const DEFAULT_ANSWERS: Answers = {
  business: { offers: [], markets: [], inquiry_dest: "both" },
  marketing: { ad_goals: ["More inquiries"] },
  website: { domain_choice: "have", goals: [], pages: ["Home", "Safari packages", "About us", "Contact"] },
  files: { mode: "drive" },
};

export type StepKey = "welcome" | "business" | "marketing" | "website" | "files" | "review" | "done";

export function stepsFor(services: { marketing: boolean; website: boolean }) {
  // A client with no package set yet sees both, so nothing is missed.
  const both = !services.marketing && !services.website;
  return [
    { key: "business" as const, label: "Your business", desc: "Contact details, what you offer, where guests come from" },
    ...(services.marketing || both ? [{ key: "marketing" as const, label: "Facebook & Instagram", desc: "Your pages, access and ad budget" }] : []),
    ...(services.website || both ? [{ key: "website" as const, label: "Your website", desc: "Domain, goals and the pages you need" }] : []),
    { key: "files" as const, label: "Photos & brand files", desc: "Share a Google Drive folder" },
    { key: "review" as const, label: "Check & submit", desc: "A quick review, then send" },
  ];
}

export function isDriveLink(v?: string) {
  return !!v && /^https:\/\/(drive|docs)\.google\.com\//.test(v.trim());
}

// What's still missing. None of these block submitting; they're shown as reminders.
export function missingItems(a: Answers, files: StoredFile[], hasMarketing: boolean) {
  const out: { step: StepKey; text: string }[] = [];
  if (!a.business?.whatsapp?.trim()) out.push({ step: "business", text: "WhatsApp number" });
  if (hasMarketing && !a.marketing?.invite_sent) out.push({ step: "marketing", text: "Meta access invitation not sent yet" });
  if (!isDriveLink(a.files?.drive_link) && files.length === 0) out.push({ step: "files", text: "Google Drive folder not shared yet" });
  else if (isDriveLink(a.files?.drive_link) && !a.files?.drive_shared) out.push({ step: "files", text: "Drive folder not marked as shared" });
  return out;
}
