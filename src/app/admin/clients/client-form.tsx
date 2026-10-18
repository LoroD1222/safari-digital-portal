"use client";
import Link from "next/link";
import { useActionState } from "react";
import type { Client } from "@/lib/types";
import { ACCOUNT_LABEL, MARKETING_LABEL, ONBOARDING_LABEL } from "@/lib/types";
import { Alert, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { ClientFormState } from "./actions";

type Props = {
  action: (state: ClientFormState, form: FormData) => Promise<ClientFormState>;
  client?: Client;
  submitLabel: string;
  cancelHref: string;
};

export function ClientForm({ action, client, submitLabel, cancelHref }: Props) {
  const [state, formAction] = useActionState<ClientFormState, FormData>(action, {});
  const fe = state.fieldErrors ?? {};
  const val = (key: string, fallback: string | null | undefined) => state.values?.[key] ?? fallback ?? "";
  return (
    <form action={formAction} className="flex flex-col gap-8" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      {state.saved && <Alert tone="success">Changes saved.</Alert>}

      <section className="flex flex-col gap-4">
        <h2 className="text-[15px] font-semibold">Company</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Company name" htmlFor="name" error={fe.name}>
              <Input id="name" name="name" defaultValue={val("name", client?.name)} aria-invalid={!!fe.name} required />
            </Field>
          </div>
          <Field label="Contact person" htmlFor="contact_name" optional>
            <Input id="contact_name" name="contact_name" defaultValue={val("contact_name", client?.contact_name)} />
          </Field>
          <Field label="Contact email" htmlFor="contact_email" optional error={fe.contact_email}>
            <Input id="contact_email" name="contact_email" type="email" defaultValue={val("contact_email", client?.contact_email)} aria-invalid={!!fe.contact_email} />
          </Field>
          <Field label="WhatsApp" htmlFor="whatsapp" optional>
            <Input id="whatsapp" name="whatsapp" type="tel" placeholder="+255" defaultValue={val("whatsapp", client?.whatsapp)} />
          </Field>
          <Field label="Website" htmlFor="website_url" optional>
            <Input id="website_url" name="website_url" placeholder="company.com" defaultValue={val("website_url", client?.website_url)} />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-4 border-t border-line-soft pt-6">
        <h2 className="text-[15px] font-semibold">Package</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Marketing" htmlFor="marketing_package">
            <Select id="marketing_package" name="marketing_package" defaultValue={val("marketing_package", client?.marketing_package)}>
              <option value="">None</option>
              {Object.entries(MARKETING_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
          </Field>
          <Field label="Website" htmlFor="website_package">
            <Select id="website_package" name="website_package" defaultValue={val("website_package", client?.website_package)}>
              <option value="">None</option>
              <option value="full_build">Full Build</option>
            </Select>
          </Field>
        </div>
      </section>

      {client && (
        <section className="flex flex-col gap-4 border-t border-line-soft pt-6">
          <h2 className="text-[15px] font-semibold">Status</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Onboarding" htmlFor="onboarding_status">
              <Select id="onboarding_status" name="onboarding_status" defaultValue={val("onboarding_status", client.onboarding_status)}>
                {Object.entries(ONBOARDING_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Account" htmlFor="account_status">
              <Select id="account_status" name="account_status" defaultValue={val("account_status", client.account_status)}>
                {Object.entries(ACCOUNT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4 border-t border-line-soft pt-6">
        <Field label="Internal notes" htmlFor="notes" optional hint="Only Safari Digital sees these.">
          <Textarea id="notes" name="notes" rows={3} defaultValue={val("notes", client?.notes)} />
        </Field>
      </section>

      <div className="flex justify-end gap-2 border-t border-line-soft pt-5">
        <Link href={cancelHref} className={buttonClass("ghost")}>Cancel</Link>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
