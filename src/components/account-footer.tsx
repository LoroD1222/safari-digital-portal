import Link from "next/link";
import { signOut } from "@/app/actions";
import { Icon } from "./icons";

function initials(text: string) {
  return text.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}

export function AccountFooter({ name, sub, href, dark }: { name: string; sub?: string; href?: string; dark?: boolean }) {
  const avatar = (
    <span className={"inline-flex size-7 flex-none items-center justify-center rounded-full text-[11px] font-semibold " + (dark ? "bg-forest text-white" : "bg-mint-soft text-forest")}>
      {initials(name)}
    </span>
  );
  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
      {href ? (
        <Link href={href} className="flex min-h-12 items-center gap-2.5 rounded-control px-2.5 text-ink no-underline hover:bg-[#EDEFEB]">
          {avatar}
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[13px] font-medium">{name}</span>
            {sub && <span className="truncate text-xs text-slate">{sub}</span>}
          </span>
          <Icon name="chevronRight" size={16} className="text-slate" />
        </Link>
      ) : (
        <div className="flex min-h-12 items-center gap-2.5 px-2.5">
          {avatar}
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[13px] font-medium">{name}</span>
            {sub && <span className="truncate text-xs text-slate">{sub}</span>}
          </span>
        </div>
      )}
      <form action={signOut}>
        <button type="submit" className="flex min-h-9 w-full items-center gap-2.5 rounded-control px-2.5 text-left text-[13px] font-medium text-body hover:bg-[#EDEFEB]">
          <Icon name="logout" size={16} />
          Sign out
        </button>
      </form>
    </div>
  );
}
