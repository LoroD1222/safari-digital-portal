import type { Metadata } from "next";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import Link from "next/link";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { INVOICE_LABEL, INVOICE_TONE, formatMoney, invoiceState, type Invoice, MARKETING_FEATURES, MARKETING_LABEL, STAGE_LABEL, WEBSITE_FEATURES, WEBSITE_LABEL } from "@/lib/types";
import type { Answers } from "@/lib/onboarding";
import { signOut } from "@/app/actions";
import { ProfileForm, PasswordForm } from "./forms";

export const metadata: Metadata = { title: "Account" };

function since(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Dar_es_Salaam" });
}

export default async function AccountPage() {
  const { viewer, company } = await getPortalContext();
  const supabase = await createClient();
  const { data: ob } = company
    ? await supabase.from("onboarding_responses").select("data").eq("client_id", company.id).maybeSingle()
    : { data: null };
  const a = (ob?.data ?? {}) as Answers;
  const { data: invData } = company
    ? await supabase.from("invoices").select("*").eq("client_id", company.id).in("status", ["sent", "paid"]).order("issue_date", { ascending: false }).limit(24)
    : { data: null };
  const invoices = ((invData ?? []) as Invoice[]).map((i) => ({ ...i, state: invoiceState(i) }));

  const packages: { service: string; name: string; since: string; items: string[] }[] = [];
  if (company?.marketing_package) {
    packages.push({
      service: "Marketing", name: MARKETING_LABEL[company.marketing_package], since: `Since ${since(company.created_at)}`,
      items: [
        ...(MARKETING_FEATURES[company.marketing_package] ?? []),
        ...(company.plan_reels ? [`This month's plan: ${company.plan_reels} Reels`] : []),
        ...(company.plan_posts ? [`This month's plan: ${company.plan_posts} posts`] : []),
      ],
    });
  }
  if (company?.website_package) {
    const stage = company.website_stage ?? "info_received";
    packages.push({
      service: "Website", name: WEBSITE_LABEL[company.website_package], since: stage === "live" ? "Live" : STAGE_LABEL[stage],
      items: WEBSITE_FEATURES[company.website_package] ?? [],
    });
  }

  const services = [company?.marketing_package && "Marketing", company?.website_package && "website"].filter(Boolean).join(" and ");
  const biz: [string, string | null | undefined][] = [
    ["Company", company?.name],
    ["Website", company?.website_url?.replace(/^https?:\/\//, "") ?? a.website?.current_site],
    ["WhatsApp", a.business?.whatsapp ?? company?.whatsapp],
    ["Facebook page", a.marketing?.facebook],
    ["Instagram", a.marketing?.instagram],
    ["Target markets", a.business?.markets?.join(", ")],
    ["Services", services ? services.charAt(0).toUpperCase() + services.slice(1) : null],
  ];

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-9">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Account</h1>
        <form action={signOut}><button className="inline-flex h-9 items-center rounded-control border border-field px-3.5 font-medium hover:bg-[#F4F5F2]">Sign out</button></form>
      </div>

      {packages.length > 0 && (
        <section aria-labelledby="pk-h" className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="pk-h" className="text-[15px] font-semibold">Your package</h2>
            <Link href="/portal/help" className="text-[13px] font-medium text-brand no-underline">Change package</Link>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3">
            {packages.map((p) => (
              <div key={p.service} className="flex flex-col gap-2.5 rounded-card border border-line px-[18px] py-4 shadow-[0_1px_2px_rgba(0,3,33,0.04)]">
                <div className="flex flex-col">
                  <span className="text-xs font-semibold uppercase tracking-[0.05em] text-brand">{p.service}</span>
                  <span className="text-[17px] font-semibold">{p.name}</span>
                  <span className="text-xs text-slate">{p.since}</span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {p.items.map((i) => (
                    <li key={i} className="flex items-start gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A6647" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 flex-none"><path d="M20 6 9 17l-5-5" /></svg>
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {company?.marketing_package && <span className="text-xs text-slate">Your Meta ad budget is paid directly to Meta and isn&apos;t part of the package.</span>}
        </section>
      )}

      {invoices.length > 0 && (
        <section id="billing" aria-labelledby="bill-h" className="flex scroll-mt-6 flex-col gap-3.5">
          <div className="flex flex-col gap-0.5">
            <h2 id="bill-h" className="text-[15px] font-semibold">Billing</h2>
            <p className="text-[13px] text-slate">Your invoices from Safari Digital. Pay by M-Pesa using the invoice number as the reference.</p>
          </div>
          <ul className="overflow-hidden rounded-card border border-line">
            {invoices.map((i, n) => (
              <li key={i.id} className={"flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 " + (n ? "border-t border-line-soft" : "")}>
                <span className="flex min-w-[160px] flex-1 flex-col">
                  <span className="font-medium">{i.number}</span>
                  <span className="text-xs text-slate">{i.items[0]?.description}</span>
                </span>
                <span className="w-28 text-[13px] text-slate">{i.state === "paid" ? `Paid ${fmtDate(i.paid_at)}` : `Due ${fmtDate(i.due_date)}`}</span>
                <span className="w-20 text-right font-medium tabular-nums">{formatMoney(Number(i.total), i.currency)}</span>
                <span className="w-20"><Badge tone={INVOICE_TONE[i.state]}>{INVOICE_LABEL[i.state]}</Badge></span>
                <a href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noopener" className="text-[13px] font-medium text-brand no-underline hover:underline">PDF</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="pf-h" className="flex flex-col gap-3.5">
        <h2 id="pf-h" className="text-[15px] font-semibold">Your profile</h2>
        <ProfileForm name={viewer.fullName ?? a.business?.contact_name ?? ""} email={viewer.email} />
      </section>

      {company && (
        <section aria-labelledby="biz-h" className="flex flex-col gap-1">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 id="biz-h" className="text-[15px] font-semibold">Business information</h2>
            <Link href="/onboarding" className="font-medium text-brand no-underline">Edit</Link>
          </div>
          {biz.map(([k, v]) => (
            <div key={k} className="flex flex-wrap gap-4 border-t border-line-soft py-2.5">
              <span className="flex-[0_0_180px] text-slate">{k}</span>
              <span className="min-w-0 flex-[1_1_200px] [overflow-wrap:anywhere]">{v || <span className="text-slate">Not added yet</span>}</span>
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="pw-h" className="flex flex-col gap-3.5">
        <h2 id="pw-h" className="text-[15px] font-semibold">Password</h2>
        <PasswordForm />
      </section>
    </div>
  );
}
