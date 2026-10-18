"use client";
import { useActionState } from "react";
import { updatePassword, type FormState } from "../actions";
import { Alert, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function ResetForm({ title, intro }: { title: string; intro: string }) {
  const [state, action] = useActionState<FormState, FormData>(updatePassword, {});
  return (
    <form action={action} className="flex flex-col gap-[18px]">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">{title}</h1>
        <p className="text-slate">{intro}</p>
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      <Field label="New password" htmlFor="password" hint="At least 8 characters">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Repeat new password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <SubmitButton pendingText="Saving…">Save password</SubmitButton>
    </form>
  );
}
