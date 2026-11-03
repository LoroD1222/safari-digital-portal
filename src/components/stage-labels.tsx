"use client";
import { createContext, useContext, type ReactNode } from "react";
import { AGENCY_WORDS, SAFARI_WORDS, type StageWords } from "@/lib/stage-words";

const Ctx = createContext<StageWords>(SAFARI_WORDS);

// Wraps the client portal so every screen uses the right stage names for this account.
export function StageLabels({ internal, children }: { internal: boolean; children: ReactNode }) {
  return <Ctx.Provider value={internal ? AGENCY_WORDS : SAFARI_WORDS}>{children}</Ctx.Provider>;
}

export function useStageWords() {
  return useContext(Ctx);
}
