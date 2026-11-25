import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPortalContext } from "@/lib/portal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EmptyState } from "@/components/ui";
import { allRows } from "@/lib/supabase/all-rows";
import { nowMs, type CallContact, type CallList, type CallLog, type CallSettings } from "@/lib/calls";
import { CallsView, type Tab } from "./calls-view";

export const metadata: Metadata = { title: "Cold calling" };

const TABS: Tab[] = ["calling", "lists", "stats", "settings"];

// Safari Digital's own account only: call lists, a shared queue, scripts and stats.
export default async function CallsPage(props: PageProps<"/portal/calls">) {
  const { company, viewer } = await getPortalContext(true);
  if (!company?.is_internal) redirect(viewer.role === "admin" ? "/admin" : "/portal");
  const sp = await props.searchParams;
  const tab = (TABS as string[]).includes(String(sp.tab)) ? (sp.tab as Tab) : "calling";
  const range = sp.range === "28" ? 28 : 7;
  const now = nowMs();
  const supabase = await createClient();
  const since = new Date(now - 28 * 864e5).toISOString();
  const [lists, contacts, logs, settings, dnc, sender, people, appts] = await Promise.all([
    supabase.from("call_lists").select("id, name, script, archived, created_at").eq("client_id", company.id).order("created_at"),
    // Every number, in list order (Supabase sends 1,000 rows at a time, so this pages through them all).
    allRows<CallContact>((f, t) => supabase.from("call_contacts").select("*").eq("client_id", company.id)
      .order("list_id").order("position", { nullsFirst: false }).order("created_at").order("id").range(f, t)),
    allRows<CallLog>((f, t) => supabase.from("call_logs").select("id, contact_id, list_id, user_id, outcome, note, created_at").eq("client_id", company.id)
      .gte("created_at", since).order("created_at", { ascending: false }).order("id").range(f, t), 20_000),
    supabase.from("call_settings").select("*").eq("client_id", company.id).maybeSingle(),
    allRows<{ phone: string; reason: string | null; created_at: string }>((f, t) => supabase.from("call_dnc").select("phone, reason, created_at").eq("client_id", company.id)
      .order("created_at", { ascending: false }).order("phone").range(f, t), 10_000),
    supabase.from("followup_settings").select("sender_ready, from_email, from_name, agent_name").eq("client_id", company.id).maybeSingle(),
    // Names of everyone on the account, to show who is calling which number.
    createAdminClient().from("profiles").select("id, full_name, email").or(`client_id.eq.${company.id},role.eq.admin`),
    // Meetings already in the Calendar, to offer free times and see who still needs one.
    supabase.from("appointments").select("inquiry_id, starts_at, duration_min").eq("client_id", company.id).eq("status", "scheduled")
      .gte("starts_at", new Date(now - 864e5).toISOString()).order("starts_at").limit(1000),
  ]);
  if (lists.error) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Cold calling</h1>
        <EmptyState title="Cold calling is almost ready" body="Run 0035_cold_calling.sql in Supabase to upload call lists." />
      </>
    );
  }
  if (contacts.error) {
    const run = /position|other_phone/.test(contacts.error.message) ? "0037_call_order.sql" : /country|address/.test(contacts.error.message) ? "0036_call_country.sql" : null;
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Cold calling</h1>
        <EmptyState title={run ? "One more step" : "Couldn't load your lists"} body={run ? `Run ${run} in Supabase (SQL Editor), then reload this page.` : contacts.error.message} />
      </>
    );
  }
  const names: Record<string, string> = {};
  for (const p of people.data ?? []) names[p.id as string] = (p.full_name as string | null)?.split(" ")[0] || String(p.email).split("@")[0];
  names[viewer.id] = "You";
  const s = settings.data as Partial<CallSettings> | null;
  return (
    <CallsView
      tab={tab} range={range} now={now} me={viewer.id} names={names}
      lists={(lists.data ?? []) as CallList[]}
      contacts={contacts.data}
      logs={logs.data}
      dnc={dnc.data}
      settings={{
        default_script: s?.default_script ?? null, daily_target: s?.daily_target ?? 40, whatsapp_intro: s?.whatsapp_intro ?? null, interested_subject: s?.interested_subject ?? null,
        interested_body: s?.interested_body ?? null, case_study_url: s?.case_study_url ?? null, case_study_name: s?.case_study_name ?? null,
      }}
      sender={{
        ready: !!sender.data?.sender_ready && !!sender.data?.from_email, email: (sender.data?.from_email as string | null) ?? null,
        // The person calling signs the WhatsApp intro; the email uses the Follow-ups signature.
        agent: viewer.fullName?.split(" ")[0] || (sender.data?.agent_name as string | null) || null,
        company: (sender.data?.from_name as string | null) || company.name.replace(/\s*\(internal\)\s*$/i, ""),
      }}
      openId={typeof sp.open === "string" && /^[0-9a-f-]{36}$/i.test(sp.open) ? sp.open : null}
      hasMeetingDefaults={!!(company.meeting_link || company.meeting_address)}
      meetings={(appts.data ?? []) as { inquiry_id: string | null; starts_at: string; duration_min: number }[]}
    />
  );
}
