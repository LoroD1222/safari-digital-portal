"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Invite links land here with the session in the URL fragment (#access_token=…),
// which never reaches the server. We store it as a cookie, then ask for a password.
export default function ConfirmPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    if (!access_token || !refresh_token) {
      setFailed(true);
      return;
    }
    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) setFailed(true);
        else window.location.replace("/reset-password?welcome=1");
      });
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-sidebar px-4 text-center">
      <Image src="/safari-digital-logo.svg" alt="Safari Digital" width={178} height={28} className="h-7 w-auto" />
      {failed ? (
        <div className="flex max-w-sm flex-col gap-2">
          <h1 className="text-xl font-semibold">This link has expired</h1>
          <p className="text-slate">Invite links work once. Ask Safari Digital for a new one, or reset your password if you already have an account.</p>
          <Link href="/forgot-password" className="font-medium text-brand no-underline">Reset password</Link>
        </div>
      ) : (
        <p role="status" className="text-slate">Setting up your account…</p>
      )}
    </div>
  );
}
