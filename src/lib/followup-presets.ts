// Follow-up templates written by Safari Digital, and the bits shared by the page and the sender.
// Only three fill-ins, because every inquiry has them: {name}, {trip}, {company}.

export type FollowupStage = "contacted" | "quoted" | "negotiating";
export type TemplateKey = "standard" | "gentle" | "persistent";

export const FOLLOWUP_STAGES: FollowupStage[] = ["contacted", "quoted", "negotiating"];
export const FOLLOWUP_DAYS = [1, 2, 3, 4, 5, 7, 10, 14, 21, 30];

export type FollowupRule = {
  id: string; client_id: string; preset: string | null; stage: FollowupStage; days: number;
  name: string; subject: string; body: string; enabled: boolean; created_at: string;
};

export type FollowupSettings = {
  client_id: string; enabled: boolean; template: TemplateKey; enabled_at: string | null;
  from_email: string | null; from_name: string | null; sender_ready: boolean; sender_checked_at: string | null;
};

type Preset = { key: string; stage: FollowupStage; days: number; on: boolean; name: string; subject: string; body: string };

const SIGN = "\n\nBest regards,\n{company}";

const CONTACTED_ASK: Omit<Preset, "key" | "days"> = {
  stage: "contacted", on: true, name: "No reply yet",
  subject: "Your {trip} inquiry",
  body: "Hi {name},\n\nJust checking you saw my reply about your {trip}. If you can send me your rough dates and how many people are travelling, I'll put together an itinerary and price for you." + SIGN,
};
const STILL_PLANNING: Omit<Preset, "key" | "days" | "on"> = {
  stage: "quoted", name: "Still planning?",
  subject: "Still planning your {trip}?",
  body: "Hi {name},\n\nAre you still thinking about your {trip}? If your plans have changed, no problem. And if you'd like to travel at a different time, I'm happy to send a new itinerary." + SIGN,
};

export const TEMPLATES: Record<TemplateKey, { title: string; note: string; presets: Preset[] }> = {
  standard: {
    title: "Standard",
    note: "One check-in at each stage: no reply yet, after the quote, and while you agree the details.",
    presets: [
      { key: "standard:contacted", days: 3, ...CONTACTED_ASK },
      {
        key: "standard:quoted", stage: "quoted", days: 5, on: true, name: "Questions about the itinerary?",
        subject: "Any questions about your {trip} itinerary?",
        body: "Hi {name},\n\nI hope you had a chance to look at the itinerary I sent for your {trip}. Happy to change anything: number of days, type of lodges, or adding a few days in Zanzibar at the end. Just reply to this email." + SIGN,
      },
      {
        key: "standard:negotiating", stage: "negotiating", days: 4, on: true, name: "Anything still open?",
        subject: "Re: your {trip}",
        body: "Hi {name},\n\nFollowing up on our last messages. Is there anything still open that I can help with? Once you're happy with the plan, we can confirm with a deposit and I'll book everything for you." + SIGN,
      },
    ],
  },
  gentle: {
    title: "Gentle",
    note: "Light touch for guests who take their time: one week after the quote, then a last check-in.",
    presets: [
      {
        key: "gentle:quoted", stage: "quoted", days: 7, on: true, name: "No rush",
        subject: "Your {trip} itinerary",
        body: "Hi {name},\n\nNo rush at all. I just wanted to make sure the itinerary arrived. If you have any questions or want to change something, I'm here." + SIGN,
      },
      { key: "gentle:quoted-late", days: 21, on: false, ...STILL_PLANNING },
    ],
  },
  persistent: {
    title: "Persistent",
    note: "For busy seasons: quicker check-ins, a WhatsApp option and an offer to check availability.",
    presets: [
      {
        key: "persistent:contacted", stage: "contacted", days: 2, on: true, name: "No reply yet",
        subject: "Your {trip} inquiry",
        body: "Hi {name},\n\nJust following up on your {trip} inquiry. If you can reply with your travel month and group size, I'll send you an itinerary and price today." + SIGN,
      },
      {
        key: "persistent:quoted", stage: "quoted", days: 3, on: true, name: "Did the itinerary arrive?",
        subject: "Did you receive your {trip} itinerary?",
        body: "Hi {name},\n\nDid the itinerary for your {trip} come through? Sometimes our emails end up in spam. If it's easier, we can also talk it through on WhatsApp or a short call." + SIGN,
      },
      {
        key: "persistent:quoted-availability", stage: "quoted", days: 7, on: true, name: "Check availability",
        subject: "Shall we check availability for your {trip}?",
        body: "Hi {name},\n\nThe lodges, camps and climbing crews in your itinerary book up early, especially from July to October and over Christmas. If you'd like, I can check availability for your dates now, with no commitment." + SIGN,
      },
      { key: "persistent:quoted-late", days: 14, on: false, ...STILL_PLANNING },
      {
        key: "persistent:negotiating", stage: "negotiating", days: 3, on: true, name: "Anything still open?",
        subject: "Re: your {trip}",
        body: "Hi {name},\n\nIs there anything still open that I can help with, like the price, the lodges or the route? Once you're happy, a deposit confirms your booking and I'll take care of the rest." + SIGN,
      },
    ],
  },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

export function presetByKey(key: string | null) {
  if (!key) return null;
  for (const t of TEMPLATE_KEYS) {
    const p = TEMPLATES[t].presets.find((x) => x.key === key);
    if (p) return p;
  }
  return null;
}

export const TOKENS = [
  { token: "{name}", label: "Guest's first name" },
  { token: "{trip}", label: "Trip" },
  { token: "{company}", label: "Your company" },
] as const;

export function firstName(full: string) {
  return full.trim().split(/\s+/)[0] || "there";
}

// "Kilimanjaro – Machame route" stays; a long free-text answer becomes "trip".
export function tripLabel(interested: string | null | undefined) {
  const t = (interested ?? "").replace(/\s+/g, " ").trim();
  return t && t.length <= 60 ? t : "trip";
}

export function fillTokens(text: string, v: { name: string; trip: string; company: string }) {
  return text.replaceAll("{name}", v.name).replaceAll("{trip}", v.trip).replaceAll("{company}", v.company);
}

// WhatsApp number in international format, or null. Tanzanian 07…/06… numbers get 255.
export function waNumber(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/\D/g, "").replace(/^00/, "").replace(/^0(?=[67]\d{8}$)/, "255");
  return d.length >= 8 ? d : null;
}

// Same timing as the emails: the follow-up for the stage the guest has waited in longest enough.
export function dueRule<T extends { stage: FollowupStage; days: number; id: string }>(
  rules: T[], stage: string, stageSince: string, done: (ruleId: string) => boolean, now = Date.now(), windowDays = 7,
) {
  const since = new Date(stageSince).getTime();
  return rules
    .filter((r) => r.stage === stage && !done(r.id))
    .filter((r) => { const at = since + r.days * 86_400_000; return at <= now && at >= now - windowDays * 86_400_000; })
    .sort((a, b) => b.days - a.days)[0] ?? null;
}
