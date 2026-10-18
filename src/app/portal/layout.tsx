import { AppShell } from "@/components/app-shell";
import { AccountFooter } from "@/components/account-footer";
import { getPortalContext } from "@/lib/portal";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const { viewer, company } = await getPortalContext();
  return (
    <AppShell
      navLabel="Main"
      nav={[
        { href: "/portal", label: "Overview", icon: "home", exact: true },
        ...(company?.website_package || company?.vercel_project_id ? [{ href: "/portal/website", label: "Website", icon: "globe" as const }] : []),
      ]}
      footer={<AccountFooter name={company?.name ?? viewer.email} sub={company ? viewer.email : undefined} href="/portal/account" />}
    >
      {children}
    </AppShell>
  );
}
