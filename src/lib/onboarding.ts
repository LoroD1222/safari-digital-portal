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
    people_added?: boolean;
    payment_added?: boolean;
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
  seo?: {
    site?: string;
    platform?: "wordpress" | "wix" | "squarespace" | "safari_digital" | "other" | "unsure";
    platform_other?: string;
    tours?: string;          // trips and destinations to rank for
    keywords?: string[];     // what guests type into Google
    markets?: string[];      // countries to rank in
    competitors?: string;
    has_gsc?: "yes" | "no" | "unsure";
    gsc_added?: boolean;     // our emails added in Search Console
    ga_added?: boolean;      // Google Analytics access too (optional)
    site_access_added?: boolean;
  };
  // Which checklist tasks the client has saved as finished.
  done?: Partial<Record<TaskKey, boolean>>;
};

export const OFFERS = ["Wildlife safaris", "Kilimanjaro treks", "Zanzibar holidays", "Day trips", "Cultural tours", "Lodge or camp"];
export const MARKETS = ["United States", "United Kingdom", "Germany", "France", "Netherlands", "Italy", "Spain"];
export const AD_GOALS = ["More inquiries", "More WhatsApp messages", "Promote a special offer", "Reach new countries"];
export const WEB_GOALS = ["Get more direct inquiries", "Show our safari packages", "Look more professional", "Be found on Google"];
export const SEO_KEYWORDS = ["Tanzania safari", "Serengeti safari", "Kilimanjaro climb", "Zanzibar holiday", "Ngorongoro crater tour", "Luxury safari Tanzania", "Budget safari Tanzania"];
export const SEO_PLATFORMS: [NonNullable<NonNullable<Answers["seo"]>["platform"]>, string][] = [
  ["wordpress", "WordPress"], ["wix", "Wix"], ["squarespace", "Squarespace"], ["safari_digital", "Built by Safari Digital"], ["other", "Something else"], ["unsure", "Not sure"],
];
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
  seo: { keywords: [], markets: [] },
};

export type TaskKey = "business" | "ads" | "website" | "meta" | "photos" | "seo_goals" | "search_console" | "site_access";

export type Task = { key: TaskKey; group: "ask" | "access"; title: string; desc: string; why: string; minutes: number };

type Service = "marketing" | "website" | "seo";
const ALL_TASKS: (Task & { needs?: Service[] })[] = [
  { key: "business", group: "ask", title: "Your business", desc: "Contact details, what you offer, where guests come from", why: "We use this in your posts, ads and website, and to send guest inquiries to the right place.", minutes: 5 },
  { key: "ads", group: "ask", title: "Advertising goals", desc: "Budget and what ads should bring you", why: "So we can plan your first campaigns around the trips that matter most.", minutes: 2, needs: ["marketing"] },
  { key: "website", group: "ask", title: "Website plans", desc: "Domain, goals and the pages you need", why: "Everything we need to plan the structure and design of your new site.", minutes: 3, needs: ["website"] },
  { key: "seo_goals", group: "ask", title: "SEO goals", desc: "Your website, the trips to rank for, competitors", why: "So we work on the searches that bring you real guests, in the countries they come from.", minutes: 4, needs: ["seo"] },
  { key: "meta", group: "access", title: "Facebook & Instagram access", desc: "Add Safari Digital as a partner in Meta Business Suite", why: "Partner access lets us post and run ads for you without ever knowing your password. You stay the owner.", minutes: 4, needs: ["marketing"] },
  { key: "search_console", group: "access", title: "Google Search Console access", desc: "Add our emails to your Search Console", why: "Search Console shows how Google sees your site and what people search to find you. It's how we measure your SEO, and you stay the owner.", minutes: 3, needs: ["seo"] },
  { key: "site_access", group: "access", title: "Website access", desc: "Add our team as a user on your website", why: "So we can improve your pages, titles and speed directly. You stay the owner and can remove us anytime.", minutes: 3, needs: ["seo"] },
  { key: "photos", group: "access", title: "Photos & logo", desc: "Share a Google Drive folder with us", why: "Real photos of your trips make the best posts, ads and website. Send what you have now and add more anytime.", minutes: 3, needs: ["marketing", "website"] },
];

export function tasksFor(services: { marketing: boolean; website: boolean; seo?: boolean }): Task[] {
  // A client with no service set yet sees the marketing and website tasks, so nothing is missed.
  const none = !services.marketing && !services.website && !services.seo;
  const on = (n: Service) => (none ? n !== "seo" : !!services[n]);
  return ALL_TASKS.filter((t) => !t.needs || t.needs.some(on)).map((t) => ({ key: t.key, group: t.group, title: t.title, desc: t.desc, why: t.why, minutes: t.minutes }));
}

export function isDriveLink(v?: string) {
  return !!v && /^https:\/\/(drive|docs)\.google\.com\//.test(v.trim());
}

// An access task only counts once the client has confirmed they did it.
export function canFinish(key: TaskKey, a: Answers) {
  // Team invited by email (older onboardings may have sent a partner request instead).
  if (key === "meta") return !!a.marketing?.people_added || !!a.marketing?.invite_sent;
  if (key === "photos") return isDriveLink(a.files?.drive_link) && !!a.files?.drive_shared;
  // No Search Console yet: we set it up once we have website access.
  if (key === "search_console") return !!a.seo?.gsc_added || a.seo?.has_gsc === "no" || a.seo?.has_gsc === "unsure";
  if (key === "site_access") return !!a.seo?.site_access_added || a.seo?.platform === "safari_digital";
  return true;
}

export function isTaskDone(key: TaskKey, a: Answers) {
  return !!a.done?.[key] && canFinish(key, a);
}

// Older saved answers have no checklist state: work it out from what was filled in.
export function inferDone(a: Answers): Answers["done"] {
  const b = a.business ?? {}, m = a.marketing ?? {}, w = a.website ?? {}, o = a.seo ?? {};
  return {
    business: !!(b.contact_name?.trim() && b.whatsapp?.trim()),
    ads: !!(m.budget?.trim() || m.promote?.trim()),
    website: !!(w.current_site?.trim() || w.domain?.trim() || w.wanted_domain?.trim() || w.likes?.trim()),
    meta: !!m.people_added || !!m.invite_sent,
    photos: canFinish("photos", a),
    seo_goals: !!(o.site?.trim() || o.tours?.trim() || o.keywords?.length),
    search_console: !!o.gsc_added,
    site_access: !!o.site_access_added,
  };
}
