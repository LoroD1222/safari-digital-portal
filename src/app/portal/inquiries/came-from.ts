// Where the chat came from → source (for reports) + channel (how they got in touch).
export const CAME_FROM = {
  instagram_ad: { label: "Instagram ad", source: "meta_ads", channel: "instagram_message" },
  facebook_ad: { label: "Facebook ad (Messenger)", source: "meta_ads", channel: "facebook_message" },
  whatsapp_ad: { label: "WhatsApp, from an ad", source: "meta_ads", channel: "whatsapp" },
  instagram: { label: "Instagram, not an ad", source: "meta_organic", channel: "instagram_message" },
  facebook: { label: "Facebook, not an ad", source: "meta_organic", channel: "facebook_message" },
  whatsapp: { label: "WhatsApp, direct", source: "direct", channel: "whatsapp" },
  phone: { label: "Phone call", source: "direct", channel: "phone" },
  email: { label: "Email", source: "direct", channel: "email" },
  website: { label: "Website", source: "website", channel: "other" },
  other: { label: "Other / not sure", source: "unknown", channel: "other" },
} as const;
export type CameFrom = keyof typeof CAME_FROM;
