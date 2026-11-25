"use client";
import { usePathname } from "next/navigation";

// Calendar and Cold calling live under /portal (internal account) and /admin.
// Links inside them stay in whichever area you opened them from.
export function useBase() {
  const path = usePathname() ?? "";
  const admin = path.startsWith("/admin");
  return {
    base: admin ? "/admin" : "/portal",
    admin,
    followups: admin ? "/admin/clients" : "/portal/followups",
    inquiry: (id: string) => (admin ? `/admin/inquiries/${id}` : `/portal/inquiries?open=${id}`),
  };
}
