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
  // Which checklist tasks the client has saved as finished.
  done?: Partial<Record<TaskKey, boolean>>;
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

export type TaskKey = "business" | "ads" | "website" | "meta" | "photos";

export type Task = { key: TaskKey; group: "ask" | "access"; title: string; desc: string; why: string; minutes: number };

const ALL_TASKS: (Task & { needs?: "marketing" | "website" })[] = [
  { key: "business", group: "ask", title: "Your business", desc: "Contact details, what you offer, where guests come from", why: "We use this in your posts, ads and website, and to send guest inquiries to the right place.", minutes: 5 },
  { key: "ads", group: "ask", title: "Advertising goals", desc: "Budget and what ads should bring you", why: "So we can plan your first campaigns around the trips that matter most.", minutes: 2, needs: "marketing" },
  { key: "website", group: "ask", title: "Website plans", desc: "Domain, goals and the pages you need", why: "Everything we need to plan the structure and design of your new site.", minutes: 3, needs: "website" },
  { key: "meta", group: "access", title: "Facebook & Instagram access", desc: "Add Safari Digital as a partner in Meta Business Suite", why: "Partner access lets us post and run ads for you without ever knowing your password. You stay the owner.", minutes: 4, needs: "marketing" },
  { key: "photos", group: "access", title: "Photos & logo", desc: "Share a Google Drive folder with us", why: "Real photos of your trips make the best posts, ads and website. Send what you have now and add more anytime.", minutes: 3 },
];

export function tasksFor(services: { marketing: boolean; website: boolean }): Task[] {
  // A client with no package set yet sees everything, so nothing is missed.
  const both = !services.marketing && !services.website;
  return ALL_TASKS.filter((t) => !t.needs || both || services[t.needs]).map((t) => ({ key: t.key, group: t.group, title: t.title, desc: t.desc, why: t.why, minutes: t.minutes }));
}

export function isDriveLink(v?: string) {
  return !!v && /^https:\/\/(drive|docs)\.google\.com\//.test(v.trim());
}

// An access task only counts once the client has confirmed they did it.
export function canFinish(key: TaskKey, a: Answers) {
  if (key === "meta") return !!a.marketing?.invite_sent;
  if (key === "photos") return isDriveLink(a.files?.drive_link) && !!a.files?.drive_shared;
  return true;
}

export function isTaskDone(key: TaskKey, a: Answers) {
  return !!a.done?.[key] && canFinish(key, a);
}

// Older saved answers have no checklist state: work it out from what was filled in.
export function inferDone(a: Answers): Answers["done"] {
  const b = a.business ?? {}, m = a.marketing ?? {}, w = a.website ?? {};
  return {
    business: !!(b.contact_name?.trim() && b.whatsapp?.trim()),
    ads: !!(m.budget?.trim() || m.promote?.trim()),
    website: !!(w.current_site?.trim() || w.domain?.trim() || w.wanted_domain?.trim() || w.likes?.trim()),
    meta: !!m.invite_sent,
    photos: canFinish("photos", a),
  };
}
