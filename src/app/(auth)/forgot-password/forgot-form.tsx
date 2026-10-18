"use client";
import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, type FormState } from "../actions";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function ForgotForm() {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordReset, {});
  if (state.done) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Check your email</h1>
        <p className="text-slate">If an account uses that address, we&apos;ve sent a link to set a new password. It works once and expires after an hour.</p>
        <Link href="/login" className="font-medium text-brand no-underline">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">Reset your password</h1>
        <p className="text-slate">We&apos;ll email you a link to choose a new one.</p>
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
      <Link href="/login" className="text-center text-[13px] font-medium text-brand no-underline">Back to sign in</Link>
    </form>
  );
}
