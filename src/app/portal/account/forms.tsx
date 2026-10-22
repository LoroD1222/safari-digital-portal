"use client";
import { useActionState } from "react";
import { Alert, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { changePassword, saveProfile, type AccountState } from "./actions";

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, action] = useActionState<AccountState, FormData>(saveProfile, {});
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        <div className="flex flex-col gap-1.5"><label htmlFor="p-name" className="font-medium">Name</label><Input id="p-name" name="full_name" defaultValue={name} autoComplete="name" /></div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="p-email" className="font-medium">Email</label>
          <Input id="p-email" type="email" value={email} readOnly aria-describedby="p-email-hint" className="bg-sidebar text-body" />
          <span id="p-email-hint" className="text-xs text-slate">Your sign-in email. Ask Safari Digital to change it.</span>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2.5">
        {state.error && <span className="text-[13px] text-danger-text">{state.error}</span>}
        {state.saved && <span className="text-[13px] text-brand">Saved</span>}
        <SubmitButton variant="secondary" className="h-9 px-3.5">Save</SubmitButton>
      </div>
    </form>
  );
}

export function PasswordForm() {
  const [state, action] = useActionState<AccountState, FormData>(changePassword, {});
  return (
    <form action={action} className="flex flex-col gap-3.5">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        <div className="flex flex-col gap-1.5"><label htmlFor="pw1" className="font-medium">Current password</label><Input id="pw1" name="current" type="password" autoComplete="current-password" /></div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pw2" className="font-medium">New password</label>
          <Input id="pw2" name="password" type="password" autoComplete="new-password" minLength={8} aria-describedby="pw-hint" />
          <span id="pw-hint" className="text-xs text-slate">At least 8 characters</span>
        </div>
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      {state.saved && <Alert tone="success">Password updated. Use it next time you sign in.</Alert>}
      <div className="flex justify-end"><SubmitButton variant="secondary" className="h-9 px-3.5" pendingText="Updating…">Update password</SubmitButton></div>
    </form>
  );
}
