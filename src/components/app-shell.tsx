import Image from "next/image";
import type { ReactNode } from "react";
import { SidebarNav, type NavItem } from "./sidebar-nav";

export function AppShell({ nav, navLabel, badge, footer, children, bottom }: {
  nav: NavItem[]; navLabel: string; badge?: string; footer: ReactNode; children: ReactNode; bottom?: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-wrap">
      <nav aria-label={navLabel} className="flex flex-[1_1_232px] flex-col gap-0.5 border-r border-line bg-sidebar px-3 py-5 md:max-w-[260px]">
        <div className="flex items-center justify-between px-2.5 pb-6 pt-1">
          <Image src="/safari-digital-logo.svg" alt="Safari Digital" width={140} height={22} priority className="h-[22px] w-auto" />
          {badge && <span className="rounded-badge bg-mint-soft px-[7px] py-0.5 text-[11px] font-semibold text-forest">{badge}</span>}
        </div>
        <SidebarNav items={nav} label={navLabel} />
        <div className="min-h-6 flex-1" />
        {bottom}
        {footer}
      </nav>
      <main className="min-w-0 flex-[999_1_560px] px-4 pb-16 pt-10 sm:px-10">
        <div className="mx-auto flex max-w-[960px] flex-col gap-8 has-[[data-wide]]:max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
