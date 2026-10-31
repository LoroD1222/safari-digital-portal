// Follow-up templates written by Safari Digital, and the personalisation shared by the page and the sender.
// Pure functions only: this file is used in the browser, on the server and in tests.

export type FollowupStage = "contacted" | "quoted" | "negotiating";
export type TemplateKey = "standard" | "gentle" | "persistent" | "blank";

export const FOLLOWUP_STAGES: FollowupStage[] = ["contacted", "quoted", "negotiating"];
export const FOLLOWUP_DAYS = [1, 2, 3, 4, 5, 6, 7, 9, 10, 12, 14, 15, 17, 21, 22, 25, 28, 30, 42, 45, 60];

// Bump when the template copy changes: clients still on older copy get the new emails (their own stay).
export const TEMPLATE_VERSION = 2;

export type FollowupRule = {
  id: string; client_id: string; preset: string | null; step: string | null; stage: FollowupStage; days: number;
  name: string; subject: string; body: string; enabled: boolean; created_at: string; timing_changed_at?: string | null;
};

export type FollowupSettings = {
  client_id: string; enabled: boolean; template: TemplateKey; enabled_at: string | null;
  from_email: string | null; from_name: string | null; sender_ready: boolean; sender_checked_at: string | null;
  agent_name: string | null; send_timezone: string; quote_valid_days: number | null; template_version: number;
};

export type Preset = { key: string; step: string; stage: FollowupStage; days: number; subject: string; body: string };

const p = (template: string, step: string, stage: FollowupStage, days: number, subject: string, body: string): Preset =>
  ({ key: `v2:${template}:${step}`, step, stage, days, subject, body: body.trim() });

// ───────────── The 30 emails (exact copy) ─────────────

const GENTLE: Preset[] = [
  p("gentle", "G1", "contacted", 4, "Following up on your Tanzania safari", `
Hi {{first_name}},

I wanted to follow up on your safari inquiry and see whether you're still planning your trip to Tanzania.

If you need any help choosing an itinerary or exploring your options, I'd be happy to assist.

Are you still considering a safari?`),
  p("gentle", "G2", "quoted", 4, "Any questions about your safari itinerary?", `
Hi {{first_name}},

I wanted to make sure you received the safari itinerary and quote we sent.

If anything is unclear or you'd like more information about the trip, I'm happy to help.

Do you have any questions about the proposal?`),
  p("gentle", "G3", "quoted", 12, "We can adjust your safari itinerary", `
Hi {{first_name}},

I wanted to mention that we can customize the safari itinerary to better suit your preferences.

Whether you'd prefer different accommodation, more time in a particular park, or a change in duration, we can explore the options.

Would you like us to adjust anything?`),
  p("gentle", "G4", "quoted", 25, "Your Tanzania safari plans", `
Hi {{first_name}},

I haven't heard back, so I wanted to check in one last time about the safari itinerary we prepared.

If you're still interested, we'd be happy to continue planning whenever you're ready.

Are you still considering the trip?`),
  p("gentle", "G5", "negotiating", 7, "Anything else we can help you with?", `
Hi {{first_name}},

I wanted to follow up on the safari details we discussed.

If there's anything you'd like to clarify about the itinerary, accommodation, or booking process, please let me know.

Is there anything else you need to help make your decision?`),
];

const STANDARD: Preset[] = [
  p("standard", "S1", "contacted", 2, "Can we help with your safari plans?", `
Hi {{first_name}},

Thank you again for your interest in visiting Tanzania.

I wanted to follow up on our previous message and see if there's anything we can help you with as you plan your safari.

Do you have any questions for us?`),
  p("standard", "S2", "contacted", 6, "Planning your Tanzania safari", `
Hi {{first_name}},

If you're still exploring safari options, we'd be happy to help you find an itinerary that suits your interests and travel plans.

We can suggest a route based on the wildlife, destinations, and experiences you'd most like to enjoy.

Would you like us to recommend an itinerary?`),
  p("standard", "S3", "quoted", 2, "Did you receive your safari proposal?", `
Hi {{first_name}},

Just wanted to check that you received the safari itinerary and quote we prepared for you.

I hope it gives you a good idea of what your Tanzania adventure could look like.

Have you had a chance to review it?`),
  p("standard", "S4", "quoted", 5, "Questions about your safari itinerary?", `
Hi {{first_name}},

I wanted to see if you have any questions about the safari proposal we sent.

I'm happy to explain more about the route, accommodation, travel times, or what's included.

Is there anything you'd like me to clarify?`),
  p("standard", "S5", "quoted", 10, "Let's make your safari the right fit", `
Hi {{first_name}},

Every safari can be tailored to the people traveling.

If you'd prefer a different pace, more time in a particular destination, or a change in the itinerary, we can look at the options.

Would you like us to make any adjustments to your trip?`),
  p("standard", "S6", "quoted", 17, "Accommodation options for your safari", `
Hi {{first_name}},

I wanted to mention that we can also explore different accommodation options for your safari, depending on your preferences and budget.

Sometimes a small change to the itinerary can make the trip a better fit.

Would you like us to look at alternative accommodation options?`),
  p("standard", "S7", "quoted", 28, "Are you still planning to visit Tanzania?", `
Hi {{first_name}},

I know planning an international trip can take some time, especially when coordinating dates and other travelers.

I wanted to check whether your Tanzania safari is still part of your plans.

If anything has changed, we can update the itinerary accordingly.

Are you still considering the trip?`),
  p("standard", "S8", "quoted", 42, "One last check-in about your safari", `
Hi {{first_name}},

I haven't heard back, so I'll leave the planning with you for now.

If you decide to move forward with your Tanzania safari, we'd be happy to help you pick up where we left off.

Simply reply to this email whenever you're ready.`),
  p("standard", "S9", "negotiating", 3, "Any remaining questions about your safari?", `
Hi {{first_name}},

I wanted to follow up on the safari options we've been discussing.

If there's anything you're still unsure about, whether it's the itinerary, accommodation, or booking arrangements, I'm happy to help.

Is there anything holding you back from making a decision?`),
  p("standard", "S10", "negotiating", 9, "Would you like to move forward with your safari?", `
Hi {{first_name}},

I wanted to check where things stand with the safari itinerary we discussed.

We can make further adjustments if needed, or help you with the next booking steps if you're happy with the plan.

Would you like to move forward, or is there anything you'd prefer to change?`),
];

const PERSISTENT: Preset[] = [
  p("persistent", "P1", "contacted", 1, "Following up on your safari inquiry", `
Hi {{first_name}},

Thank you for your interest in exploring Tanzania with us.

I wanted to make sure our previous message reached you.

Are you still looking for help planning your safari?`),
  p("persistent", "P2", "contacted", 3, "What would you like to experience in Tanzania?", `
Hi {{first_name}},

Tanzania offers many different safari experiences, and we'd love to help you plan a trip that suits your interests.

If you have any additional preferences or ideas for your safari, we'd be happy to include them.

Is there anything in particular you'd like us to focus on?`),
  p("persistent", "P3", "contacted", 7, "Shall we continue planning your safari?", `
Hi {{first_name}},

I wanted to check in once more about your Tanzania safari inquiry.

If you're still considering the trip, we'd be glad to help you explore the options.

Would you like us to continue planning with you?`),
  p("persistent", "P4", "quoted", 1, "Your Tanzania safari proposal", `
Hi {{first_name}},

I hope you received the safari itinerary and quote we prepared for you.

We'd be happy to answer any questions or explain more about the trip.

Did everything come through correctly?`),
  p("persistent", "P5", "quoted", 3, "Any questions about the safari proposal?", `
Hi {{first_name}},

Just following up to see if you've had a chance to review your safari itinerary.

If you'd like more details about the route, activities, or accommodation, I'm happy to help.

Is there anything you'd like to know more about?`),
  p("persistent", "P6", "quoted", 6, "We can personalize your safari", `
Hi {{first_name}},

The itinerary we sent is flexible, and we can adapt it to better suit your interests.

Whether you'd prefer more wildlife viewing, a slower pace, or extra time in a particular destination, we can discuss the options.

Would you like to make any changes?`),
  p("persistent", "P7", "quoted", 10, "Different accommodation options", `
Hi {{first_name}},

I wanted to let you know that we can explore different accommodation options for your safari.

Depending on your preferences, we can look at alternatives that better match the comfort level and experience you're looking for.

Would you like us to review the accommodation choices?`),
  p("persistent", "P8", "quoted", 15, "Can we help with your safari budget?", `
Hi {{first_name}},

If you're comparing safari prices, we're happy to help you understand the different options.

We can review the itinerary, trip length, and accommodation choices to see what might work better for your budget.

Would you find it helpful to explore an alternative itinerary?`),
  p("persistent", "P9", "quoted", 22, "Planning around your Tanzania travel dates", `
Hi {{first_name}},

Your travel dates can make a difference when choosing the best safari route and experience.

If your dates are flexible, we can look at different options based on the wildlife and destinations you'd most like to see.

Would you like us to review the itinerary around your travel dates?`),
  p("persistent", "P10", "quoted", 30, "How are your Tanzania travel plans coming along?", `
Hi {{first_name}},

I know planning a safari can take time, especially when arranging flights, schedules, and travel companions.

I wanted to see if there's anything we can help you with as you make your plans.

Do you have any new questions about the trip?`),
  p("persistent", "P11", "quoted", 45, "Would you like an updated safari itinerary?", `
Hi {{first_name}},

It's been a little while since we sent your safari proposal, so I wanted to check whether anything has changed.

If your dates, group size, or travel preferences are different now, we can prepare an updated itinerary.

Would that be useful for you?`),
  p("persistent", "P12", "quoted", 60, "A final note about your safari plans", `
Hi {{first_name}},

I wanted to follow up one final time about your Tanzania safari.

I understand that travel plans can change, so I'll leave things here for now.

If you're still interested or decide to revisit the trip later, you're always welcome to reply. We'd be happy to help.`),
  p("persistent", "P13", "negotiating", 2, "Anything we can clarify before you decide?", `
Hi {{first_name}},

I wanted to follow up on the safari details we've been discussing.

If you have any remaining questions about the itinerary, accommodation, or booking process, I'm happy to assist.

Is there anything you'd like us to clarify?`),
  p("persistent", "P14", "negotiating", 5, "Shall we review the final safari options?", `
Hi {{first_name}},

I wanted to check whether you'd like any final adjustments to your safari plan.

We can review the itinerary and available options together to make sure everything suits your expectations.

Would you like us to revise anything before proceeding?`),
  p("persistent", "P15", "negotiating", 12, "Your safari plans — whenever you're ready", `
Hi {{first_name}},

I wanted to follow up once more on the safari we've been discussing.

If you'd like to move forward, we're happy to guide you through the next steps. And if your plans have changed, that's completely fine too.

Just let us know what works best for you. We'll be happy to help whenever you're ready.`),
];

export const TEMPLATES: Record<TemplateKey, { title: string; note: string; presets: Preset[] }> = {
  gentle: {
    title: "Gentle",
    note: "Warm and respectful, with longer gaps. For guests who like to take their time.",
    presets: GENTLE,
  },
  standard: {
    title: "Standard",
    note: "Helpful and consistent without sounding pushy. Right for most operators.",
    presets: STANDARD,
  },
  persistent: {
    title: "Persistent",
    note: "Proactive over a longer period, each email with a new reason to reach out. Never aggressive.",
    presets: PERSISTENT,
  },
  blank: {
    title: "Empty",
    note: "No follow-ups from Safari Digital. Start from nothing and write your own.",
    presets: [],
  },
};

// Shown lightest to strongest, then empty.
export const TEMPLATE_KEYS: TemplateKey[] = ["gentle", "standard", "persistent", "blank"];

export function presetByKey(key: string | null) {
  if (!key) return null;
  for (const t of TEMPLATE_KEYS) {
    const found = TEMPLATES[t].presets.find((x) => x.key === key);
    if (found) return found;
  }
  return null;
}

// ───────────── Personalisation ─────────────

export const TOKENS = [
  { token: "{{first_name}}", label: "First name", help: "The guest's first name. If it's missing, \"Hi {{first_name}},\" becomes \"Hello,\"." },
  { token: "{{trip_name}}", label: "Trip", help: "What they asked about. If it's missing: \"Tanzania safari\"." },
  { token: "{{travel_dates}}", label: "Travel dates", help: "Their travel dates. If they're not known: \"your travel dates\"." },
  { token: "{{agent_name}}", label: "Your name", help: "The name you sign with. If it's not set: your company name." },
  { token: "{{company_name}}", label: "Company", help: "Your company name." },
] as const;

export type Personal = { firstName: string | null; trip: string | null; travelDates: string | null; agent: string | null; company: string };

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

// The guest's first name, or null when the name field doesn't hold a usable name.
export function firstName(full: string | null | undefined) {
  const first = clean(full).split(" ")[0] ?? "";
  if (!first || first.length < 2 || /[@\d]/.test(first) || /^(unknown|guest|n\/?a|none|test|-+)$/i.test(first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

// "Kilimanjaro – Machame route" stays; a long free-text answer isn't a trip name.
export function tripLabel(interested: string | null | undefined) {
  const t = clean(interested);
  return t && t.length <= 60 ? t : null;
}

export function travelDatesLabel(dates: string | null | undefined) {
  const t = clean(dates);
  return t && t.length <= 60 ? t : null;
}

const T = {
  first: /\{\{\s*first_name\s*\}\}|\[\s*first\s*name\s*\]|\{name\}/gi,
  trip: /\{\{\s*trip_name\s*\}\}|\[\s*trip\s*\]|\{trip\}/gi,
  dates: /\{\{\s*travel_dates\s*\}\}/gi,
  agent: /\{\{\s*agent_name\s*\}\}/gi,
  company: /\{\{\s*company_name\s*\}\}|\[\s*company(\s*name)?\s*\]|\{company\}/gi,
};

// Fills the tags. Never leaves an empty or unknown tag behind, and never invents details.
export function personalize(text: string, v: Personal) {
  const agent = clean(v.agent) || clean(v.company);
  let out = text;
  if (!v.firstName) {
    // "Hi {{first_name}}," → "Hello,"
    out = out.replace(/\b(hi|hello|hey|dear)\s+(\{\{\s*first_name\s*\}\}|\[\s*first\s*name\s*\]|\{name\})\s*,/gi, "Hello,");
  }
  out = out
    .replace(T.first, v.firstName ?? "there")
    .replace(T.trip, v.trip ?? "Tanzania safari")
    .replace(T.dates, v.travelDates ?? "your travel dates")
    .replace(T.agent, agent)
    .replace(T.company, clean(v.company))
    .replace(/\{\{[^}]*\}\}/g, "")      // any unknown tag
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?])/g, "$1");
  return out;
}

// Added to the end of every email. No duplicate company name when there's no agent name.
export function signature(v: Pick<Personal, "agent" | "company">) {
  const agent = clean(v.agent);
  const company = clean(v.company);
  return agent && agent.toLowerCase() !== company.toLowerCase()
    ? `Best regards,\n\n${agent}\n${company}`
    : `Best regards,\n\n${company}`;
}

export function composeEmail(rule: { subject: string; body: string }, v: Personal) {
  return {
    subject: personalize(rule.subject, v).replace(/\s+/g, " ").trim().slice(0, 200),
    body: `${personalize(rule.body, v).trim()}\n\n${signature(v)}`,
  };
}

// WhatsApp number in international format, or null. Tanzanian 07…/06… numbers get 255.
export function waNumber(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/\D/g, "").replace(/^00/, "").replace(/^0(?=[67]\d{8}$)/, "255");
  return d.length >= 8 ? d : null;
}
