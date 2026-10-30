import { AppShell } from "@/components/app-shell";
import { AccountFooter } from "@/components/account-footer";
import { HelpButton } from "@/components/help-panel";
import type { NavItem } from "@/components/sidebar-nav";
import { LiveInquiries } from "@/components/live-inquiries";
import { getPortalContext } from "@/lib/portal";
import { stopViewAs } from "@/app/view-as-actions";

function ViewAsBanner({ name }: { name: string }) {
  return (
    <div role="status" className="-mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-[#F1E2C3] bg-[#FFFAF0] px-4 py-2.5 text-[13px] text-[#8A5A12]">
      <span className="min-w-[220px] flex-1">
        <span className="font-semibold">You&apos;re viewing the portal as {name}.</span> This is exactly what they see. Buttons that act for the client, like approving content or sending a request, are for them, not for you.
      </span>
      <form action={stopViewAs}><button className="h-8 rounded-control bg-[#8A5A12] px-3 font-semibold text-white hover:bg-[#6F470D]">Exit client view</button></form>
    </div>
  );
}
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const { viewer, company, viewingAs } = await getPortalContext();
  const nav: NavItem[] = [{ href: "/portal", label: "Overview", icon: "home", exact: true }];
  let help = null;
  if (company) {
    const supabase = await createClient();
    const [{ count: newInquiries }, { count: replies }, settings, { count: toApprove }] = await Promise.all([
      supabase.from("inquiries").select("id", { count: "exact", head: true }).eq("client_id", company.id).eq("status", "new"),
      supabase.from("requests").select("id", { count: "exact", head: true }).eq("client_id", company.id).neq("status", "completed").eq("last_message_role", "admin"),
      getSettings(),
      supabase.from("content_items").select("id", { count: "exact", head: true }).eq("client_id", company.id).eq("status", "awaiting_approval"),
    ]);
    if (company.marketing_package) nav.push({ href: toApprove ? "/portal/marketing" : "/portal/marketing/advertising", base: "/portal/marketing", label: "Marketing", icon: "megaphone", badge: toApprove ?? 0 });
    if (company.website_package || company.vercel_project_id || company.tracking_since) nav.push({ href: "/portal/website", label: "Website", icon: "globe" });
    nav.push({ href: "/portal/inquiries", label: "Inquiries", icon: "inbox", badge: newInquiries ?? 0 });
    nav.push({ href: "/portal/pipeline", label: "Pipeline", icon: "pipeline" });
    nav.push({ href: "/portal/requests", label: "Requests", icon: "message", badge: replies ?? 0 });
    help = <HelpButton whatsapp={settings.support_whatsapp} email={settings.support_email} openRequests={replies ?? 0} />;
  }
  return (
    <AppShell navLabel="Main" nav={nav} bottom={help}
      footer={<AccountFooter name={company?.name ?? viewer.email} sub={company ? viewer.email : undefined} href="/portal/account" />}>
      {viewingAs && company && <ViewAsBanner name={company.name} />}
      {children}
      {company && <LiveInquiries clientId={company.id} href="/portal/inquiries" />}
    </AppShell>
  );
}
