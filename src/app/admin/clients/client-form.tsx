"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import type { Client, ClientPrivate } from "@/lib/types";
import { ACCOUNT_LABEL, MARKETING_LABEL, MARKETING_PRICE, ONBOARDING_LABEL, WEBSITE_LABEL, WEBSITE_PRICE, discounted, formatMoney, type DiscountType, type MarketingPackage, type WebsitePackage } from "@/lib/types";
import { Alert, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { ClientFormState } from "./actions";

type Props = {
  action: (state: ClientFormState, form: FormData) => Promise<ClientFormState>;
  client?: Client;
  billing?: ClientPrivate | null;
  submitLabel: string;
  cancelHref: string;
};

export function ClientForm({ action, client, billing, submitLabel, cancelHref }: Props) {
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

      <PackagePricing client={client} billing={billing} val={val} fe={fe} />

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
          <Textarea id="notes" name="notes" rows={3} defaultValue={val("notes", billing?.notes)} />
        </Field>
      </section>

      <div className="flex justify-end gap-2 border-t border-line-soft pt-5">
        <Link href={cancelHref} className={buttonClass("ghost")}>Cancel</Link>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

type Val = (key: string, fallback: string | null | undefined) => string;

function DiscountInputs({ prefix, type, value, setType, setValue }: {
  prefix: string; type: DiscountType; value: string; setType: (t: DiscountType) => void; setValue: (v: string) => void;
}) {
  return (
    <Field label="Discount" htmlFor={`${prefix}discount_value`} optional>
      <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
        <Input id={`${prefix}discount_value`} name={`${prefix}discount_value`} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="0" />
        <Select aria-label="Discount type" name={`${prefix}discount_type`} value={type} onChange={(e) => setType(e.target.value as DiscountType)}>
          <option value="percent">%</option>
          <option value="amount">$</option>
        </Select>
      </div>
    </Field>
  );
}

function Summary({ list, final, per, type, value }: { list: number; final: number; per: string; type: DiscountType; value: number }) {
  const off = list - final;
  return (
    <p className="rounded-control bg-sidebar px-3 py-2 text-[13px] text-body">
      {off > 0
        ? <>List {formatMoney(list, "USD")} − {type === "percent" ? `${value}%` : formatMoney(value, "USD")} = <strong className="font-semibold text-ink">{formatMoney(final, "USD")}{per}</strong></>
        : <>Price: <strong className="font-semibold text-ink">{formatMoney(list, "USD")}{per}</strong> (list price)</>}
    </p>
  );
}

// Package choice sets the price; a discount (percent or $) can be applied.
// Custom packages show a price field instead.
function PackagePricing({ client, billing, val, fe }: { client?: Client; billing?: ClientPrivate | null; val: Val; fe: Record<string, string> }) {
  const [mk, setMk] = useState(val("marketing_package", client?.marketing_package));
  const [web, setWeb] = useState(val("website_package", client?.website_package));
  const [dType, setDType] = useState<DiscountType>((val("discount_type", billing?.discount_type) || "percent") as DiscountType);
  const [dVal, setDVal] = useState(val("discount_value", billing?.discount_value ? String(billing.discount_value) : ""));
  const [wType, setWType] = useState<DiscountType>((val("website_discount_type", billing?.website_discount_type) || "percent") as DiscountType);
  const [wVal, setWVal] = useState(val("website_discount_value", billing?.website_discount_value ? String(billing.website_discount_value) : ""));

  const mkList = mk ? MARKETING_PRICE[mk as MarketingPackage] : null;
  const webList = web ? WEBSITE_PRICE[web as WebsitePackage] : null;
  const num = (v: string) => Number(v.replace(/[, %$]/g, "")) || 0;

  return (
    <>
      <section className="flex flex-col gap-4 border-t border-line-soft pt-6">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold">Package and price</h2>
          <p className="text-[13px] text-slate">The price follows the package. Add a discount if this client gets one. Only Safari Digital sees prices; the monthly price adds up to MRR.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Marketing" htmlFor="marketing_package">
            <Select id="marketing_package" name="marketing_package" value={mk} onChange={(e) => setMk(e.target.value)}>
              <option value="">None</option>
              {Object.entries(MARKETING_LABEL).map(([v, l]) => { const p = MARKETING_PRICE[v as MarketingPackage]; return <option key={v} value={v}>{l} · {p ? `$${p}/month` : "custom"}</option>; })}
            </Select>
          </Field>
          {mk && (mkList !== null
            ? <DiscountInputs prefix="" type={dType} value={dVal} setType={setDType} setValue={setDVal} />
            : (
              <div className="grid grid-cols-[1fr_96px] gap-2">
                <Field label="Monthly price" htmlFor="monthly_fee" error={fe.monthly_fee}>
                  <Input id="monthly_fee" name="monthly_fee" inputMode="decimal" placeholder="e.g. 1200" defaultValue={val("monthly_fee", billing?.monthly_fee != null ? String(billing.monthly_fee) : "")} aria-invalid={!!fe.monthly_fee} />
                </Field>
                <Field label="Currency" htmlFor="currency">
                  <Select id="currency" name="currency" defaultValue={val("currency", billing?.currency ?? "USD")}>
                    <option value="USD">USD</option>
                    <option value="TZS">TZS</option>
                  </Select>
                </Field>
              </div>
            ))}
        </div>
        {mk && mkList !== null && <Summary list={mkList} final={discounted(mkList, dType, num(dVal))} per=" / month" type={dType} value={num(dVal)} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Website" htmlFor="website_package">
            <Select id="website_package" name="website_package" value={web} onChange={(e) => setWeb(e.target.value)}>
              <option value="">None</option>
              {Object.entries(WEBSITE_LABEL).map(([v, l]) => { const p = WEBSITE_PRICE[v as WebsitePackage]; return <option key={v} value={v}>{l} · {p ? `$${p} one-time` : "custom"}</option>; })}
            </Select>
          </Field>
          {web && (webList !== null
            ? <DiscountInputs prefix="website_" type={wType} value={wVal} setType={setWType} setValue={setWVal} />
            : (
              <Field label="Website price (one-time, USD)" htmlFor="website_fee">
                <Input id="website_fee" name="website_fee" inputMode="decimal" placeholder="e.g. 2500" defaultValue={val("website_fee", billing?.website_fee != null ? String(billing.website_fee) : "")} />
              </Field>
            ))}
        </div>
        {web && webList !== null && <Summary list={webList} final={discounted(webList, wType, num(wVal))} per=" one-time" type={wType} value={num(wVal)} />}

        <div className="max-w-[240px]">
          <Field label="Paying since" htmlFor="billing_start" optional hint="When the monthly price started. Used for the MRR chart.">
            <Input id="billing_start" name="billing_start" type="date" defaultValue={val("billing_start", billing?.billing_start ?? "")} />
          </Field>
        </div>
      </section>
    </>
  );
}
