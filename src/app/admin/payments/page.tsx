import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Invoice } from "@/lib/types";
import { todayTz } from "@/lib/invoices";
import { paymentEvents, type BillableClient, type PayEvent, type PayKind } from "@/lib/payments-calendar";
import { PaymentsCalendar } from "./calendar";
import { plansByClient, type SeoPlanMonth } from "@/lib/seo-plan";
import { ButtonLink, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata: Metadata = { title: "Payments" };

// Totals per currency: "$1,200" or "$1,200 + TZS 2,500,000".
const money = (list: PayEvent[]) => {
  const by = new Map<string, number>();
  for (const e of list) by.set(e.currency, (by.get(e.currency) ?? 0) + e.amount);
  const parts = [...by.entries()].filter(([, v]) => v).map(([c, v]) => formatMoney(Math.round(v * 100) / 100, c as "USD" | "TZS"));
  return parts.length ? parts.join(" + ") : formatMoney(0, "USD");
};

export default async function PaymentsPage(props: PageProps<"/admin/payments">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const today = todayTz();
  const month = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const supabase = await createClient();
  const [{ data: inv, error }, { data: cl }, { data: priv }] = await Promise.all([
    supabase.from("invoices").select("*").neq("status", "cancelled").limit(2000),
    supabase.from("clients").select("*"),
    supabase.from("client_private").select("*"),
  ]);
  const p = new Map((priv ?? []).map((r) => [r.client_id as string, r]));
  const clients: BillableClient[] = (cl ?? []).map((c) => ({ ...(c as BillableClient), ...(p.get(c.id) ?? {}), id: c.id, name: c.name }));
  const invoices = (inv ?? []) as Invoice[];
  const { data: planRows } = await supabase.from("seo_plan").select("*"); // none before 0032
  const plans = plansByClient((planRows ?? []) as (SeoPlanMonth & { client_id: string })[], (cl ?? []).filter((c) => c.seo_enabled).map((c) => ({ client_id: c.id as string, seo_start: c.seo_start as string | null })));
  const events = paymentEvents(month, invoices, clients, today, plans);

  const sum = (k: PayKind[]) => money(events.filter((e) => k.includes(e.kind)));
  const count = (k: PayKind[]) => events.filter((e) => k.includes(e.kind)).length;
  const allOverdue = paymentEvents("", invoices, [], today).filter((e) => e.kind === "overdue");
  const label = new Date(month + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <PageHeader title="Payments" subtitle="Who paid, who owes what and when, and the monthly fees coming up. Monthly invoices are prepared on the 1st and due on the 15th."
        actions={<ButtonLink variant="secondary" href="/admin/invoices"><Icon name="receipt" size={16} />All invoices</ButtonLink>} />
      {error && <p className="text-[13px] text-danger-text">Run 0012_invoices.sql in Supabase to start using invoices.</p>}

      <section aria-label="Summary" className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Stat label={`Received in ${label.split(" ")[0]}`} value={sum(["paid"])} note={`${count(["paid"])} ${count(["paid"]) === 1 ? "payment" : "payments"}`} />
        <Stat label="Still to come this month" value={sum(["due", "draft", "expected"])} note={`${count(["due", "draft", "expected"])} expected`} />
        <Stat label="Overdue, all months" value={money(allOverdue)}
          note={allOverdue.length ? `${allOverdue.length} past the due date` : "Nothing overdue"} href={allOverdue.length ? "/admin/invoices?status=overdue" : undefined} />
      </section>

      <PaymentsCalendar key={`${month}:${events.map((e) => `${e.invoiceId ?? e.clientId}@${e.date}`).join(",")}`} month={month} today={today} events={events} />
    </>
  );
}
