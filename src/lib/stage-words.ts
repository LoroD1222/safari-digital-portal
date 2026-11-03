import { AGENCY_STAGES, INQUIRY_LABEL, STAGES, type InquiryStatus } from "./types";

// Stage names and wording. Safari Digital's own (internal) account sells to tour operators,
// so its pipeline says Proposal sent / Signed and Deal value instead of Quote sent / Booked and Trip value.
export const AGENCY_LABEL: Record<InquiryStatus, string> = {
  new: "New lead", contacted: "Contacted", meeting: "Meeting booked", no_show: "No show", quoted: "Proposal sent", negotiating: "Negotiating", booked: "Signed", closed: "Lost",
};

export type StageWords = { stages: InquiryStatus[]; next: Partial<Record<InquiryStatus, InquiryStatus>>; label: Record<InquiryStatus, string>; value: string; valueHelp: string; booked: string; quote: string; internal: boolean };

export const SAFARI_WORDS: StageWords = {
  stages: STAGES, next: { new: "contacted", contacted: "quoted", quoted: "negotiating", negotiating: "booked" },
  label: INQUIRY_LABEL, value: "Trip value", booked: "Booked", quote: "the quote", internal: false,
  valueHelp: "The total the guest pays. It shows your booked revenue and teaches your Meta ads which inquiries are worth the most.",
};
export const AGENCY_WORDS: StageWords = {
  // The › arrow: a meeting leads to a proposal; a no-show goes back to booking a meeting.
  stages: AGENCY_STAGES, next: { new: "contacted", contacted: "meeting", meeting: "quoted", no_show: "meeting", quoted: "negotiating", negotiating: "booked" },
  label: AGENCY_LABEL, value: "Deal value", booked: "Signed", quote: "the proposal", internal: true,
  valueHelp: "What the client pays (first invoice or yearly value). It shows signed revenue and teaches your Meta ads which leads are worth the most.",
};

export function stageWords(internal: boolean | undefined) {
  return internal ? AGENCY_WORDS : SAFARI_WORDS;
}
