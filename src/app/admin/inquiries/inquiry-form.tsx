"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Alert, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { CHANNEL_LABEL, INQUIRY_LABEL, LOST_REASONS, SOURCE_LABEL, type Inquiry } from "@/lib/types";
import type { InquiryFormState } from "./actions";

export function InquiryForm({ action, inquiry, clients, defaultClient, cancelHref, submitLabel }: {
  action: (s: InquiryFormState, f: FormData) => Promise<InquiryFormState>;
  inquiry?: Inquiry; clients?: { id: string; name: string }[]; defaultClient?: string; cancelHref: string; submitLabel: string;
}) {
  const [state, formAction] = useActionState<InquiryFormState, FormData>(action, {});
  const fe = state.fieldErrors ?? {};
  const v = (k: string, d?: string | null) => state.values?.[k] ?? d ?? "";
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      {state.error && <Alert>{state.error}</Alert>}
      {state.saved && <Alert tone="success">Saved.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        {clients && (
          <div className="sm:col-span-2">
            <Field label="Client" htmlFor="client_id" error={fe.client_id}>
              <Select id="client_id" name="client_id" defaultValue={v("client_id", defaultClient)} aria-invalid={!!fe.client_id}>
                <option value="">Choose a client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
        )}
        <Field label="Name" htmlFor="customer_name" error={fe.customer_name}>
          <Input id="customer_name" name="customer_name" defaultValue={v("customer_name", inquiry?.customer_name)} aria-invalid={!!fe.customer_name} />
        </Field>
        <Field label="Country" htmlFor="country" optional>
          <Input id="country" name="country" defaultValue={v("country", inquiry?.country)} />
        </Field>
        <Field label="Email" htmlFor="email" error={fe.email} hint="Email or phone is needed.">
          <Input id="email" name="email" type="email" defaultValue={v("email", inquiry?.email)} aria-invalid={!!fe.email} />
        </Field>
        <Field label="Phone or WhatsApp" htmlFor="phone" optional>
          <Input id="phone" name="phone" type="tel" defaultValue={v("phone", inquiry?.phone)} />
        </Field>
        <Field label="Interested in" htmlFor="interested_in" optional>
          <Input id="interested_in" name="interested_in" placeholder="7-day Serengeti safari" defaultValue={v("interested_in", inquiry?.interested_in)} />
        </Field>
        <Field label="Travel dates" htmlFor="travel_dates" optional>
          <Input id="travel_dates" name="travel_dates" placeholder="March 2027" defaultValue={v("travel_dates", inquiry?.travel_dates)} />
        </Field>
        <Field label="Travellers" htmlFor="travellers" optional>
          <Input id="travellers" name="travellers" placeholder="2 adults" defaultValue={v("travellers", inquiry?.travellers)} />
        </Field>
        <Field label="Received" htmlFor="received_at" error={fe.received_at}>
          <Input id="received_at" name="received_at" type="date" defaultValue={v("received_at", inquiry?.received_at?.slice(0, 10) ?? today)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Message" htmlFor="message" optional>
            <Textarea id="message" name="message" rows={3} defaultValue={v("message", inquiry?.message)} />
          </Field>
        </div>
      </div>
      <div className="grid gap-4 border-t border-line-soft pt-5 sm:grid-cols-2">
        <Field label="Came from" htmlFor="source" hint="Where they found the operator.">
          <Select id="source" name="source" defaultValue={v("source", inquiry?.source ?? "meta_ads")}>
            {Object.entries(SOURCE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Got in touch by" htmlFor="channel">
          <Select id="channel" name="channel" defaultValue={v("channel", inquiry?.channel ?? "whatsapp")}>
            {Object.entries(CHANNEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Campaign" htmlFor="campaign" optional>
          <Input id="campaign" name="campaign" defaultValue={v("campaign", inquiry?.campaign)} />
        </Field>
        <Field label="Status" htmlFor="status">
          <Select id="status" name="status" defaultValue={v("status", inquiry?.status ?? "new")}>
            {Object.entries(INQUIRY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
      </div>
      <fieldset className="grid gap-4 border-t border-line-soft pt-5 sm:grid-cols-2">
        <legend className="mb-1 font-semibold">Deal</legend>
        <Field label="Trip value (USD)" htmlFor="trip_value" optional error={fe.trip_value} hint="The total the guest pays. Sent to Meta with Booked.">
          <Input id="trip_value" name="trip_value" inputMode="decimal" placeholder="4200" defaultValue={v("trip_value", inquiry?.trip_value != null ? String(inquiry.trip_value) : "")} />
        </Field>
        <Field label="Next follow-up" htmlFor="follow_up_on" optional>
          <Input id="follow_up_on" name="follow_up_on" type="date" defaultValue={v("follow_up_on", inquiry?.follow_up_on)} />
        </Field>
        <Field label="Lost reason" htmlFor="lost_reason" optional hint="Only when the stage is Lost.">
          <Select id="lost_reason" name="lost_reason" defaultValue={v("lost_reason", inquiry?.lost_reason)}>
            <option value="">—</option>
            {LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes" htmlFor="notes" optional hint="The client sees these too.">
            <Textarea id="notes" name="notes" rows={3} defaultValue={v("notes", inquiry?.notes)} />
          </Field>
        </div>
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-line-soft pt-5">
        <Link href={cancelHref} className={buttonClass("ghost")}>Cancel</Link>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
