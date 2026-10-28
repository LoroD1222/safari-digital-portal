import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Alert, Field, PageHeader, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createInvoice } from "../actions";
import { monthBounds } from "@/lib/dates";

export const metadata: Metadata = { title: "New invoice" };

export default async function NewInvoice(props: PageProps<"/admin/invoices/new">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const supabase = await createClient();
  const { data: clients } = await supabase.from("clients").select("id, name").neq("account_status", "paused").order("name");
  const month = monthBounds(0).label;
  const err = typeof sp.error === "string" ? (sp.error === "client" ? "Choose a client." : sp.error) : null;
  return (
    <div className="flex max-w-[560px] flex-col gap-6">
      <Link href="/admin/invoices" className="text-[13px] font-medium text-brand no-underline">← Invoices</Link>
      <PageHeader title="New invoice" subtitle="It starts as a draft. You can edit the lines before sending." />
      {err && <Alert>{err}</Alert>}
      <form action={createInvoice} className="flex flex-col gap-5">
        <Field label="Client" htmlFor="client_id">
          <Select id="client_id" name="client_id" defaultValue={typeof sp.client === "string" ? sp.client : ""} required>
            <option value="" disabled>Choose…</option>
            {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-2 font-medium">What is it for?</legend>
          {[
            ["monthly", `Monthly marketing · ${month}`, "Their package price, with their discount as a separate line."],
            ["website", "Website", "Their website package fee (one-time)."],
            ["blank", "Something else", "Start empty and add your own lines."],
          ].map(([v, l, d], n) => (
            <label key={v} className="flex cursor-pointer items-start gap-3 rounded-control border border-field px-3.5 py-3 has-[:checked]:border-brand has-[:checked]:bg-[#F1FAF6]">
              <input type="radio" name="type" value={v} defaultChecked={n === 0} className="mt-1 accent-[#1A6647]" />
              <span className="flex flex-col"><span className="font-medium">{l}</span><span className="text-[13px] text-slate">{d}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="flex justify-end"><SubmitButton>Create draft</SubmitButton></div>
      </form>
    </div>
  );
}
