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
