"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Invite and new-link emails point here with ?token_hash=…&type=invite|recovery.
// Nothing is used up until the person clicks the button, so email scanners and
// link previews (Gmail, Outlook, WhatsApp) can't expire the link.
// Older links arrive with the session in the URL fragment (#access_token=…); that still works.
type Phase = "ready" | "working" | "failed";

export function Confirm({ token, signedInAs }: { token: { hash: string; type: "invite" | "recovery" } | null; signedInAs: string | null }) {
  const [phase, setPhase] = useState<Phase>(token ? "ready" : "working");

  useEffect(() => {
    if (token) return;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    const session: Promise<{ error: unknown }> = access_token && refresh_token
      ? createClient().auth.setSession({ access_token, refresh_token })
      : Promise.resolve({ error: new Error("missing") });
    session.then(({ error }) => {
      if (error) setPhase("failed");
      else window.location.replace("/reset-password?welcome=1");
    });
  }, [token]);

  async function continueSetup() {
    if (!token) return;
    setPhase("working");
    const supabase = createClient();
    if (signedInAs) await supabase.auth.signOut({ scope: "local" });
    const { error } = await supabase.auth.verifyOtp({ token_hash: token.hash, type: token.type });
    if (error) setPhase("failed");
    else window.location.replace("/reset-password?welcome=1");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-sidebar px-4 text-center">
      <Image src="/safari-digital-logo.svg" alt="Safari Digital" width={178} height={28} className="h-7 w-auto" />
      {phase === "failed" ? (
        <div className="flex max-w-sm flex-col gap-2">
          <h1 className="text-xl font-semibold">This link has expired</h1>
          <p className="text-slate">Links work once and expire after 24 hours. Ask Safari Digital to send a new invite, or reset your password if you already have an account.</p>
          <Link href="/forgot-password" className="font-medium text-brand no-underline">Reset password</Link>
        </div>
      ) : phase === "ready" ? (
        <div className="flex max-w-sm flex-col items-center gap-3">
          <h1 className="text-xl font-semibold">{token?.type === "recovery" ? "Set a new password" : "Welcome to your Safari Digital portal"}</h1>
          <p className="text-slate">Click below to continue. You&apos;ll choose your password on the next screen.</p>
          {signedInAs && (
            <div role="note" className="rounded-card border border-warn-text/20 bg-warn-bg px-4 py-3 text-left text-[14px] text-warn-text">
              You&apos;re signed in on this browser as <strong className="break-all">{signedInAs}</strong>. Continuing will sign you out of that account.
              To keep it, open this link in a private window instead.
            </div>
          )}
          <button type="button" onClick={continueSetup}
            className="mt-1 inline-flex h-11 items-center rounded-control bg-brand px-6 font-semibold text-white hover:bg-brand-hover">
            {signedInAs ? "Sign out and continue" : token?.type === "recovery" ? "Continue" : "Set up my account"}
          </button>
          {signedInAs && <Link href="/" className="text-[14px] font-medium text-brand no-underline">Go back to {signedInAs}</Link>}
        </div>
      ) : (
        <p role="status" className="text-slate">Setting up your account…</p>
      )}
    </div>
  );
}
