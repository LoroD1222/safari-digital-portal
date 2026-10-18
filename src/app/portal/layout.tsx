import { AppShell } from "@/components/app-shell";
import { AccountFooter } from "@/components/account-footer";
import { getPortalContext } from "@/lib/portal";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const { viewer, company } = await getPortalContext();
  return (
    <AppShell
      navLabel="Main"
      nav={[{ href: "/portal", label: "Overview", icon: "home", exact: true }]}
      footer={<AccountFooter name={company?.name ?? viewer.email} sub={company ? viewer.email : undefined} href="/portal/account" />}
    >
      {children}
    </AppShell>
  );
}
