import { AppShell } from "@/components/app-shell";
import { AccountFooter } from "@/components/account-footer";
import { HelpButton } from "@/components/help-panel";
import type { NavItem } from "@/components/sidebar-nav";
import { LiveInquiries } from "@/components/live-inquiries";
import { getPortalContext } from "@/lib/portal";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const { viewer, company } = await getPortalContext();
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
    nav.push({ href: "/portal/requests", label: "Requests", icon: "message", badge: replies ?? 0 });
    help = <HelpButton whatsapp={settings.support_whatsapp} email={settings.support_email} openRequests={replies ?? 0} />;
  }
  return (
    <AppShell navLabel="Main" nav={nav} bottom={help}
      footer={<AccountFooter name={company?.name ?? viewer.email} sub={company ? viewer.email : undefined} href="/portal/account" />}>
      {children}
      {company && <LiveInquiries clientId={company.id} href="/portal/inquiries" />}
    </AppShell>
  );
}
