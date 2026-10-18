import type { AccountStatus, OnboardingStatus } from "./types";
import type { Tone } from "@/components/ui";

export const ONBOARDING_TONE: Record<OnboardingStatus, Tone> = {
  not_started: "neutral",
  in_progress: "blue",
  submitted: "amber",
  being_reviewed: "amber",
  setup_complete: "green",
};

export const ACCOUNT_TONE: Record<AccountStatus, Tone> = {
  invited: "neutral",
  active: "green",
  paused: "red",
};

import type { ContentStatus, InquiryStatus, RequestStatus } from "./types";

export const CONTENT_TONE: Record<ContentStatus, Tone> = {
  draft: "neutral", awaiting_approval: "amber", changes_requested: "red", approved: "blue", scheduled: "blue", published: "green",
};
export const INQUIRY_TONE: Record<InquiryStatus, Tone> = { new: "amber", contacted: "blue", booked: "green", closed: "neutral" };
export const REQUEST_TONE: Record<RequestStatus, Tone> = { submitted: "amber", in_progress: "blue", waiting_for_client: "amber", completed: "green" };
