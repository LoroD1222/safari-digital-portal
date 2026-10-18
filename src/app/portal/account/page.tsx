import type { Metadata } from "next";
import { getPortalContext } from "@/lib/portal";
import { packageSummary } from "@/lib/types";
import { PageHeader } from "@/components/ui";
import { ResetForm } from "@/app/(auth)/reset-password/reset-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const { viewer, company } = await getPortalContext();
  const rows = [
    { k: "Email", v: viewer.email },
    { k: "Company", v: company?.name ?? "Not linked yet" },
    { k: "Package", v: company ? packageSummary(company) : "—" },
  ];
  return (
    <div className="flex max-w-[720px] flex-col gap-9">
      <PageHeader title="Account" />
      <section aria-labelledby="pf-h" className="flex flex-col">
        <h2 id="pf-h" className="mb-2 text-[15px] font-semibold">Your details</h2>
        <dl>
          {rows.map((r) => (
            <div key={r.k} className="flex flex-wrap gap-4 border-t border-line-soft py-2.5">
              <dt className="w-44 text-slate">{r.k}</dt>
              <dd className="min-w-0 flex-1 break-words">{r.v}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section aria-label="Change password" className="max-w-sm">
        <ResetForm title="Change password" intro="You'll use it the next time you sign in." />
      </section>
    </div>
  );
}
