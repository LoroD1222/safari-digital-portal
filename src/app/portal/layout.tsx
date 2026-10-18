import { AppShell } from "@/components/app-shell";
import { AccountFooter } from "@/components/account-footer";
import type { NavItem } from "@/components/sidebar-nav";
import { getPortalContext } from "@/lib/portal";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const { viewer, company } = await getPortalContext();
  const nav: NavItem[] = [{ href: "/portal", label: "Overview", icon: "home", exact: true }];
  if (company) {
    if (company.marketing_package) nav.push({ href: "/portal/marketing", label: "Marketing", icon: "megaphone" });
    if (company.website_package || company.vercel_project_id) nav.push({ href: "/portal/website", label: "Website", icon: "globe" });
    nav.push({ href: "/portal/inquiries", label: "Inquiries", icon: "inbox" });
    nav.push({ href: "/portal/help", label: "Help", icon: "help" });
  }
  return (
    <AppShell navLabel="Main" nav={nav}
      footer={<AccountFooter name={company?.name ?? viewer.email} sub={company ? viewer.email : undefined} href="/portal/account" />}>
      {children}
    </AppShell>
  );
}
