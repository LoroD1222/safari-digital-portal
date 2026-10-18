import { AppShell } from "@/components/app-shell";
import { AccountFooter } from "@/components/account-footer";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const viewer = await requireAdmin();
  return (
    <AppShell
      navLabel="Admin"
      badge="Admin"
      nav={[
        { href: "/admin", label: "Overview", icon: "home", exact: true },
        { href: "/admin/clients", label: "Clients", icon: "users" },
        { href: "/admin/content", label: "Content", icon: "film" },
        { href: "/admin/inquiries", label: "Inquiries", icon: "inbox" },
        { href: "/admin/requests", label: "Requests", icon: "message" },
        { href: "/admin/settings", label: "Settings", icon: "settings" },
      ]}
      footer={<AccountFooter name={viewer.fullName ?? viewer.email} sub="Safari Digital" dark />}
    >
      {children}
    </AppShell>
  );
}
