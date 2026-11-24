"use client";
import { useState, useTransition } from "react";
import { Alert, Button, Input } from "@/components/ui";
import type { CallContact } from "@/lib/calls";
import { addContact, updateContact, type ContactInput } from "./actions";

// Edit a number's details, or add one by hand to a list.
export function ContactForm({ contact, listId, onDone, onCancel }: {
  contact?: CallContact; listId?: string; onDone: (message: string, contact?: CallContact) => void; onCancel: () => void;
}) {
  const [v, setV] = useState<ContactInput>({
    company: contact?.company ?? "", contact_name: contact?.contact_name ?? "", phone: contact?.phone ?? "", other_phone: contact?.other_phone ?? "", email: contact?.email ?? "",
    website: contact?.website ?? "", address: contact?.address ?? "", city: contact?.city ?? "", country: contact?.country ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const f = (k: keyof ContactInput, label: string, props: Record<string, string> = {}) => (
    <label className="flex flex-col gap-1 text-[13px] font-medium">{label}
      <Input value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} className="h-9" {...props} />
    </label>
  );
  const save = () => start(async () => {
    setError(null);
    const r = contact ? await updateContact(contact.id, v) : await addContact(listId!, v);
    if (!r.ok) { setError(r.error); return; }
    onDone(r.message ?? "Saved.", "contact" in r ? (r.contact as CallContact) : undefined);
  });
  return (
    <div className="flex flex-col gap-3 rounded-control border border-line bg-sidebar p-3.5">
      <div className="grid gap-2.5 sm:grid-cols-2">
        {f("company", "Company", { placeholder: "e.g. Kibo Safaris" })}
        {f("contact_name", "Contact name", { placeholder: "e.g. Daniel Mollel" })}
        {f("phone", "Phone number", { inputMode: "tel", placeholder: "0754 123 456" })}
        {f("other_phone", "Second phone number", { inputMode: "tel", placeholder: "Optional" })}
        {f("email", "Email", { type: "email" })}
        {f("website", "Website", { placeholder: "kibosafaris.com" })}
        {f("address", "Address", { placeholder: "Street, building, P.O. Box" })}
        {f("city", "City", { placeholder: "Arusha" })}
        {f("country", "Country", { placeholder: "Tanzania", list: "call-countries" })}
      </div>
      <datalist id="call-countries">{["Tanzania", "Kenya", "Uganda", "Rwanda", "South Africa", "USA", "UK", "Germany"].map((c) => <option key={c} value={c} />)}</datalist>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button className="h-9" disabled={pending} onClick={save}>{pending ? "Saving…" : contact ? "Save details" : "Add number"}</Button>
        <Button variant="secondary" className="h-9" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
