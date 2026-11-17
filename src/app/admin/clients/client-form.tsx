"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import type { Client, ClientPrivate } from "@/lib/types";
import { ACCOUNT_LABEL, MARKETING_LABEL, MARKETING_PRICE, ONBOARDING_LABEL, WEBSITE_LABEL, WEBSITE_PRICE, discounted, formatMoney, type DiscountType, type MarketingPackage, type WebsitePackage } from "@/lib/types";
import { Alert, Field, Input, Select, Textarea, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { ClientFormState } from "./actions";
import type { SeoPlanMonth } from "@/lib/seo-plan";

type Props = {
  action: (state: ClientFormState, form: FormData) => Promise<ClientFormState>;
  client?: Client;
  billing?: ClientPrivate | null;
  seoPlan?: SeoPlanMonth[];
  submitLabel: string;
  cancelHref: string;
};

export function ClientForm({ action, client, billing, seoPlan, submitLabel, cancelHref }: Props) {
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
            {!client && (
              <label className="mt-1.5 flex items-center gap-2 text-[13px] text-body">
                <input type="checkbox" name="invite_now" defaultChecked className="size-4 accent-[#1A6647]" />
                Email this person an invite to the portal when I save
              </label>
            )}
          </Field>
          <Field label="WhatsApp" htmlFor="whatsapp" optional>
            <Input id="whatsapp" name="whatsapp" type="tel" placeholder="+255" defaultValue={val("whatsapp", client?.whatsapp)} />
          </Field>
          <Field label="Website" htmlFor="website_url" optional>
            <Input id="website_url" name="website_url" placeholder="company.com" defaultValue={val("website_url", client?.website_url)} />
          </Field>
        </div>
      </section>

      <PackagePricing client={client} billing={billing} seoPlan={seoPlan ?? []} val={val} fe={fe} />

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
function PackagePricing({ client, billing, seoPlan, val, fe }: { client?: Client; billing?: ClientPrivate | null; seoPlan: SeoPlanMonth[]; val: Val; fe: Record<string, string> }) {
  const [mk, setMk] = useState(val("marketing_package", client?.marketing_package));
  const [web, setWeb] = useState(val("website_package", client?.website_package));
  const [seo, setSeo] = useState(val("seo_enabled", client?.seo_enabled ? "on" : "") === "on");
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
          <p className="text-[13px] text-slate">The price follows the package. Add a discount if this client gets one. Only Safari Digital sees prices; the monthly price (marketing plus SEO) adds up to MRR.</p>
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
        {web && (
          <div className="max-w-[240px]">
            <Field label="Website built in" htmlFor="website_built_on" optional hint="The month the website was finished. Used for the website income chart.">
              <Input id="website_built_on" name="website_built_on" type="month" defaultValue={val("website_built_on", billing?.website_built_on ? billing.website_built_on.slice(0, 7) : "")} />
            </Field>
          </div>
        )}

        <input type="hidden" name="seo_field" value="1" />
        <SeoPlanFields on={seo} setOn={setSeo} plan={seoPlan} start={client?.seo_start ?? null} showCurrency={!mk} currency={val("currency", billing?.currency ?? "TZS")} usdOnly={!!mk && mkList !== null} error={fe.seo_plan} />

        <div className="max-w-[240px]">
          <Field label="Paying since" htmlFor="billing_start" optional hint="When the monthly price started. Used for the MRR chart.">
            <Input id="billing_start" name="billing_start" type="date" defaultValue={val("billing_start", billing?.billing_start ?? "")} />
          </Field>
        </div>
      </section>
    </>
  );
}

// SEO plan: how many months, and each month's name, price and backlinks cost.
function SeoPlanFields({ on, setOn, plan, start, showCurrency, currency, usdOnly, error }: {
  on: boolean; setOn: (v: boolean) => void; plan: SeoPlanMonth[]; start: string | null; showCurrency: boolean; currency: string; usdOnly: boolean; error?: string;
}) {
  const blank = (n: number): SeoPlanMonth => ({ month_no: n, title: "", price: 0, backlinks: 0 });
  const [rows, setRows] = useState<SeoPlanMonth[]>(plan.length ? plan : [1, 2, 3].map(blank));
  const [cur, setCur] = useState(usdOnly ? "USD" : currency || "TZS");
  const setCount = (n: number) => setRows((r) => Array.from({ length: n }, (_, i) => r[i] ?? blank(i + 1)));
  const set = (i: number, patch: Partial<SeoPlanMonth>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const num = (v: string) => Number(v.replace(/[^\d.]/g, "")) || 0;
  const c = (usdOnly ? "USD" : cur) as "USD" | "TZS";
  const total = rows.reduce((n, r) => n + r.price + r.backlinks, 0);
  return (
    <div className="flex flex-col gap-4 rounded-card border border-line-soft bg-sidebar px-4 py-4">
      <label className="flex items-center gap-2.5 text-[14px] font-medium">
        <input name="seo_enabled" type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="size-4 accent-[#1A6647]" />
        SEO service
        <span className="font-normal text-slate">· SEO onboarding, SEO tab, backlinks</span>
      </label>
      {on && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Plan starts" htmlFor="seo_start" hint="Month 1 is invoiced in this month.">
              <Input id="seo_start" name="seo_start" type="month" defaultValue={start ? start.slice(0, 7) : ""} />
            </Field>
            <Field label="Number of months" htmlFor="seo_months">
              <Input id="seo_months" name="seo_months" type="number" min={1} max={36} value={rows.length} onChange={(e) => setCount(Math.min(36, Math.max(1, Number(e.target.value) || 1)))} />
            </Field>
            {showCurrency ? (
              <Field label="Currency" htmlFor="seo_currency">
                <Select id="seo_currency" name="currency" value={cur} onChange={(e) => setCur(e.target.value)}>
                  <option value="TZS">TZS</option><option value="USD">USD</option>
                </Select>
              </Field>
            ) : <p className="self-end pb-2 text-xs text-slate">{usdOnly ? "In USD, like the marketing package." : "In the marketing currency above."}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <div className="hidden grid-cols-[64px_1fr_150px_150px] gap-2 text-xs font-medium text-slate sm:grid"><span /><span>Name</span><span>Price</span><span>Backlinks cost</span></div>
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 border-t border-line-soft pt-2 sm:grid-cols-[64px_1fr_150px_150px] sm:border-0 sm:pt-0">
                <span className="col-span-2 self-center text-[13px] font-semibold sm:col-span-1">Month {i + 1}</span>
                <Input className="col-span-2 sm:col-span-1" name={`seo_title_${i + 1}`} aria-label={`Month ${i + 1} name`} placeholder={["Foundation & Authority Building", "Content Authority & Backlink Expansion", "Authority, International SEO & AI Search"][i] ?? "What this month focuses on"} value={r.title} onChange={(e) => set(i, { title: e.target.value })} />
                <Input name={`seo_price_${i + 1}`} aria-label={`Month ${i + 1} price`} inputMode="decimal" placeholder="Price" value={r.price || ""} onChange={(e) => set(i, { price: num(e.target.value) })} />
                <Input name={`seo_backlinks_${i + 1}`} aria-label={`Month ${i + 1} backlinks cost`} inputMode="decimal" placeholder="Backlinks" value={r.backlinks || ""} onChange={(e) => set(i, { backlinks: num(e.target.value) })} />
              </div>
            ))}
          </div>
          {error && <p className="text-[13px] text-danger-text">{error}</p>}
          <p className="rounded-control bg-white px-3 py-2 text-[13px] text-body">
            Total {rows.length}-month plan: <strong className="font-semibold text-ink">{formatMoney(total, c)}</strong>
            {" "}· invoiced each month in advance: the month&apos;s price and its backlinks cost as separate lines.
          </p>
        </>
      )}
    </div>
  );
}
