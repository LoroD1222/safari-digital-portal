"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icons";

export type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };

export function SidebarNav({ items, label }: { items: NavItem[]; label: string }) {
  const path = usePathname();
  return (
    <ul aria-label={label} className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.exact ? path === item.href : path === item.href || path.startsWith(item.href + "/");
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                "flex min-h-10 items-center gap-2.5 rounded-control px-2.5 font-medium no-underline " +
                (active
                  ? "bg-white text-ink shadow-[0_0_0_1px_#E6E8EC,0_1px_2px_rgba(0,3,33,0.04)] [&_svg]:text-brand"
                  : "text-body hover:bg-[#EDEFEB]")
              }
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
