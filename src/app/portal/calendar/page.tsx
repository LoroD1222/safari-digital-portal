import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { addDays, todayEat, weekStart, type Appointment } from "@/lib/appointments";
import { EmptyState } from "@/components/ui";
import { CalendarView, type Lead } from "./calendar-view";

export const metadata: Metadata = { title: "Calendar" };

// Safari Digital's own account only: meetings we book with leads.
export default async function CalendarPage(props: PageProps<"/portal/calendar">) {
  const { company } = await getPortalContext(true);
  if (!company?.is_internal) redirect("/portal");
  const sp = await props.searchParams;
  const today = todayEat();
  const monday = weekStart(typeof sp.w === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) ? sp.w : today);
  const supabase = await createClient();
  const from = `${addDays(monday, -1)}T21:00:00Z`; // Monday 00:00 EAT
  const until = `${addDays(monday, 13)}T21:00:00Z`; // through next week, for the upcoming list
  const [appts, leads] = await Promise.all([
    supabase.from("appointments").select("*").eq("client_id", company.id).gte("starts_at", from).lt("starts_at", until).order("starts_at"),
    supabase.from("inquiries").select("id, customer_name, email, phone, status, received_at").eq("client_id", company.id)
      .not("status", "in", "(booked,closed)").order("received_at", { ascending: false }).limit(300),
  ]);
  if (appts.error) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Calendar</h1>
        <EmptyState title="The calendar is almost ready" body="Run 0033_appointments.sql in Supabase to start booking meetings." />
      </>
    );
  }
  const lead = typeof sp.lead === "string" ? sp.lead : null;
  return (
    <CalendarView
      monday={monday} today={today}
      appointments={(appts.data ?? []) as Appointment[]}
      leads={(leads.data ?? []) as Lead[]}
      defaults={{ link: company.meeting_link ?? "", address: company.meeting_address ?? "" }}
      openForLead={lead}
    />
  );
}
