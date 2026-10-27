"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { addInquiry, type AddInquiryState } from "./actions";
import { CAME_FROM } from "./came-from";

// "+ Add inquiry": log a chat from Instagram, WhatsApp, Messenger or a call in a few seconds.
export function AddInquiry() {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex h-[34px] items-center gap-1.5 rounded-control bg-brand px-3 text-[13px] font-semibold text-white hover:bg-brand-hover">
        <Icon name="plus" size={16} />Add inquiry
      </button>
      {open && <AddDialog key={round} onClose={() => setOpen(false)} onAnother={() => setRound((r) => r + 1)} />}
    </>
  );
}

function AddDialog({ onClose, onAnother }: { onClose: () => void; onAnother: () => void }) {
  const [state, action] = useActionState<AddInquiryState, FormData>(addInquiry, {});
  const first = useRef<HTMLInputElement>(null);
  const fe = state.fieldErrors ?? {};
  const [today] = useState(() => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10));

  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,3,33,0.45)] p-4 sm:p-6" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="add-h" className="flex max-h-full w-full max-w-[560px] flex-col gap-4 overflow-auto rounded-card bg-white px-5 py-5 shadow-[0_24px_64px_rgba(0,3,33,0.25)] sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="add-h" className="text-[17px] font-semibold">Add an inquiry</h2>
            <span className="text-[13px] text-slate">For chats on Instagram, WhatsApp or Messenger, and phone calls. Website inquiries come in by themselves.</span>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="inline-flex size-8 flex-none items-center justify-center rounded-control text-slate hover:bg-[#F4F5F2]"><Icon name="close" size={18} /></button>
        </div>

        {state.saved ? (
          <div className="flex flex-col gap-4">
            <Alert tone="success">Saved. {state.name} is now in your inquiries.</Alert>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onAnother} className="h-10 rounded-control border border-field px-4 font-medium hover:bg-[#F4F5F2]">Add another</button>
              <button type="button" onClick={onClose} className="h-10 rounded-control bg-brand px-4 font-semibold text-white hover:bg-brand-hover">Done</button>
            </div>
          </div>
        ) : (
          <form action={action} className="flex flex-col gap-4" noValidate>
            {state.error && <Alert>{state.error}</Alert>}
            <Field label="Name" htmlFor="ai-name" error={fe.customer_name}>
              <Input ref={first} id="ai-name" name="customer_name" autoComplete="off" aria-invalid={!!fe.customer_name} />
            </Field>
            <Field label="Where did they come from?" htmlFor="ai-from" error={fe.came_from}>
              <Select id="ai-from" name="came_from" defaultValue="" aria-invalid={!!fe.came_from}>
                <option value="" disabled>Choose…</option>
                {Object.entries(CAME_FROM).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="WhatsApp / phone" htmlFor="ai-phone" error={fe.phone}>
                <Input id="ai-phone" name="phone" type="tel" placeholder="+44…" aria-invalid={!!fe.phone} />
              </Field>
              <Field label="Email" htmlFor="ai-email" optional error={fe.email}>
                <Input id="ai-email" name="email" type="email" aria-invalid={!!fe.email} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Interested in" htmlFor="ai-int" optional>
                <Input id="ai-int" name="interested_in" placeholder="e.g. 7-day Serengeti" />
              </Field>
              <Field label="Country" htmlFor="ai-country" optional>
                <Input id="ai-country" name="country" placeholder="e.g. Germany" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Travel dates" htmlFor="ai-dates" optional>
                <Input id="ai-dates" name="travel_dates" placeholder="e.g. July 2027" />
              </Field>
              <Field label="Travellers" htmlFor="ai-trav" optional>
                <Input id="ai-trav" name="travellers" placeholder="e.g. 2 adults" />
              </Field>
              <Field label="Received" htmlFor="ai-date" error={fe.received_on}>
                <Input id="ai-date" name="received_on" type="date" defaultValue={today} max={today} />
              </Field>
            </div>
            <Field label="Notes" htmlFor="ai-msg" optional>
              <Textarea id="ai-msg" name="message" rows={2} placeholder="What they asked about" />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="h-10 rounded-control px-4 font-medium text-slate hover:text-ink">Cancel</button>
              <SubmitButton>Save inquiry</SubmitButton>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
