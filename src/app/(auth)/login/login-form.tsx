"use client";
import Link from "next/link";
import { useActionState } from "react";
import { signIn, type FormState } from "../actions";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function LoginForm({ notice, linkError }: { notice?: string; linkError?: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(signIn, {});
  return (
    <form action={action} className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Sign in to your portal</h1>
        <p className="text-slate">Your marketing, website and inquiries in one place.</p>
      </div>
      {notice && <Alert tone="success">{notice}</Alert>}
      {linkError && !state.error && <Alert>That link has expired or was already used. Use &ldquo;Forgot password?&rdquo; to get a new one.</Alert>}
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@company.com" required />
      </Field>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="password" className="font-medium">Password</label>
          <Link href="/forgot-password" className="text-[13px] font-medium text-brand no-underline hover:text-forest">Forgot password?</Link>
        </div>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
    </form>
  );
}
