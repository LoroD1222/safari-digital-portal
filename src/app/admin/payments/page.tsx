import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, type Invoice } from "@/lib/types";
import { todayTz } from "@/lib/invoices";
import { paymentEvents, type BillableClient, type PayKind } from "@/lib/payments-calendar";
import { PaymentsCalendar } from "./calendar";
import { ButtonLink, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata: Metadata = { title: "Payments" };

const usd = (n: number) => formatMoney(Math.round(n * 100) / 100, "USD");

export default async function PaymentsPage(props: PageProps<"/admin/payments">) {
  await requireAdmin();
  const sp = await props.searchParams;
  const today = todayTz();
  const month = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : today.slice(0, 7);
  const supabase = await createClient();
  const [{ data: inv, error }, { data: cl }, { data: priv }] = await Promise.all([
    supabase.from("invoices").select("*").neq("status", "cancelled").limit(2000),
    supabase.from("clients").select("id, name, marketing_package, account_status, is_internal"),
    supabase.from("client_private").select("client_id, monthly_fee, discount_type, discount_value, billing_start"),
  ]);
  const p = new Map((priv ?? []).map((r) => [r.client_id as string, r]));
  const clients: BillableClient[] = (cl ?? []).map((c) => ({ ...(c as BillableClient), ...(p.get(c.id) ?? {}), id: c.id, name: c.name }));
  const invoices = (inv ?? []) as Invoice[];
  const events = paymentEvents(month, invoices, clients, today);

  const inUsd = events.filter((e) => e.currency === "USD");
  const sum = (k: PayKind[]) => inUsd.filter((e) => k.includes(e.kind)).reduce((n, e) => n + e.amount, 0);
  const count = (k: PayKind[]) => events.filter((e) => k.includes(e.kind)).length;
  const allOverdue = paymentEvents("", invoices, [], today).filter((e) => e.kind === "overdue");
  const label = new Date(month + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <>
      <PageHeader title="Payments" subtitle="Who paid, who owes what and when, and the monthly fees coming up. Monthly invoices are prepared on the 1st and due on the 15th."
        actions={<ButtonLink variant="secondary" href="/admin/invoices"><Icon name="receipt" size={16} />All invoices</ButtonLink>} />
      {error && <p className="text-[13px] text-danger-text">Run 0012_invoices.sql in Supabase to start using invoices.</p>}

      <section aria-label="Summary" className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Stat label={`Received in ${label.split(" ")[0]}`} value={usd(sum(["paid"]))} note={`${count(["paid"])} ${count(["paid"]) === 1 ? "payment" : "payments"}`} />
        <Stat label="Still to come this month" value={usd(sum(["due", "draft", "expected"]))} note={`${count(["due", "draft", "expected"])} expected`} />
        <Stat label="Overdue, all months" value={usd(allOverdue.filter((e) => e.currency === "USD").reduce((n, e) => n + e.amount, 0))}
          note={allOverdue.length ? `${allOverdue.length} past the due date` : "Nothing overdue"} href={allOverdue.length ? "/admin/invoices?status=overdue" : undefined} />
      </section>

      <PaymentsCalendar month={month} today={today} events={events} />
    </>
  );
}
