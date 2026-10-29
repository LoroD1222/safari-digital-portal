"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert, Button } from "@/components/ui";

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

  const invite = token?.type !== "recovery";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-sidebar px-4 py-12">
      <Image src="/safari-digital-logo.svg" alt="Safari Digital" width={178} height={28} priority className="h-7 w-auto" />
      <div className="w-full max-w-[380px] rounded-card border border-line bg-white px-7 py-8 shadow-[0_1px_2px_rgba(0,3,33,0.04)]">
        {phase === "failed" ? (
          <div className="flex flex-col gap-3">
            <h1 className="text-xl font-semibold tracking-[-0.01em]">This link has expired</h1>
            <p className="text-slate">Links work once and expire after 24 hours. Ask Safari Digital to send a new invite, or reset your password if you already have an account.</p>
            <Link href="/forgot-password" className="font-medium text-brand no-underline">Reset password</Link>
          </div>
        ) : phase === "ready" ? (
          <div className="flex flex-col gap-[18px]">
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold tracking-[-0.01em]">{invite ? "Welcome to your portal" : "Set a new password"}</h1>
              <p className="text-slate">Continue to choose your password on the next screen.</p>
            </div>
            {signedInAs && (
              <Alert tone="info">
                You&apos;re signed in on this browser as <strong className="break-all font-semibold">{signedInAs}</strong>. Continuing signs you out of that account. To keep it, open this link in a private window instead.
              </Alert>
            )}
            <Button type="button" onClick={continueSetup}>
              {signedInAs ? "Sign out and continue" : invite ? "Set up my account" : "Continue"}
            </Button>
            {signedInAs && <Link href="/" className="text-center text-[13px] font-medium text-brand no-underline hover:text-forest">Go back to {signedInAs}</Link>}
          </div>
        ) : (
          <p role="status" className="text-slate">Setting up your account…</p>
        )}
      </div>
      <p className="text-center text-[13px] text-slate">Questions? Reply to the email Safari Digital sent you.</p>
    </div>
  );
}
