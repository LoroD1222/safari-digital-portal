import type { Answers, StoredFile } from "@/lib/onboarding";
import { FILE_CATEGORIES } from "@/lib/onboarding";

type Row = { k: string; v: React.ReactNode };

function list(v?: string[]) {
  return v && v.length ? v.join(", ") : null;
}

function Section({ title, rows }: { title: string; rows: Row[] }) {
  const shown = rows.filter((r) => r.v !== null && r.v !== undefined && r.v !== "");
  return (
    <div className="flex flex-col">
      <h3 className="mb-1 text-[13px] font-semibold text-slate">{title}</h3>
      {shown.length === 0 ? (
        <p className="border-t border-line-soft py-2 text-[13px] text-slate">Not filled in yet</p>
      ) : (
        <dl>
          {shown.map((r) => (
            <div key={r.k} className="flex flex-wrap gap-4 border-t border-line-soft py-2">
              <dt className="w-48 text-slate">{r.k}</dt>
              <dd className="min-w-0 flex-1 whitespace-pre-line break-words">{r.v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export function OnboardingSummary({ answers, submittedAt, files }: {
  answers: Answers | null; submittedAt: string | null; files: (StoredFile & { url: string | null })[];
}) {
  const a = answers ?? {};
  const b = a.business ?? {}, m = a.marketing ?? {}, w = a.website ?? {}, f = a.files ?? {};
  const dest = { whatsapp: "WhatsApp", email: "Email", both: "WhatsApp and email" } as const;
  const domain = w.domain_choice === "have" ? [w.domain, w.registrar && `registered with ${w.registrar}`].filter(Boolean).join(", ") || "Has a domain"
    : w.domain_choice === "need" ? `Needs one${w.wanted_domain ? `: ${w.wanted_domain}` : ""}` : w.domain_choice === "unsure" ? "Not sure" : null;
  const link = (href?: string) => href ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand">{href}</a> : null;

  return (
    <section aria-labelledby="ob-h" className="flex flex-col gap-5 border-t border-line-soft pt-6">
      <div className="flex flex-col gap-0.5">
        <h2 id="ob-h" className="text-[15px] font-semibold">Onboarding answers</h2>
        <p className="text-[13px] text-slate">
          {submittedAt ? `Submitted ${new Date(submittedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : answers ? "In progress, not submitted yet" : "The client hasn't started onboarding yet"}
        </p>
      </div>
      {answers && (
        <>
          <Section title="Business" rows={[
            { k: "Contact person", v: b.contact_name }, { k: "WhatsApp", v: b.whatsapp }, { k: "About", v: b.about },
            { k: "Offers", v: list(b.offers) }, { k: "Guest countries", v: list(b.markets) },
            { k: "Inquiries go to", v: b.inquiry_dest ? dest[b.inquiry_dest] + (b.inquiry_email ? ` · ${b.inquiry_email}` : "") : null },
          ]} />
          <Section title="Facebook & Instagram" rows={[
            { k: "Instagram", v: m.no_instagram ? "None yet, wants one set up" : m.instagram }, { k: "Facebook page", v: m.facebook },
            { k: "Meta access invite", v: m.invite_sent ? "Client says it's sent" : "Not sent yet" },
            { k: "Team added to ad account", v: m.people_added ? "Client says they're added" : "Not yet" },
            { k: "Monthly ad budget", v: m.budget ? `$${m.budget}` : null }, { k: "Ad goals", v: list(m.ad_goals) }, { k: "Promote first", v: m.promote },
          ]} />
          <Section title="Website" rows={[
            { k: "Current website", v: w.current_site }, { k: "Domain", v: domain }, { k: "Goals", v: list(w.goals) },
            { k: "Pages", v: list(w.pages) }, { k: "Websites they like", v: w.likes },
          ]} />
          <Section title="Photos & brand files" rows={[
            { k: "Sharing by", v: f.mode === "drive" ? "Google Drive" : f.mode === "upload" ? "Upload" : null },
            { k: "Drive folder", v: link(f.drive_link) }, { k: "Folder shared", v: f.mode === "drive" ? (f.drive_shared ? "Yes" : "Not yet") : null },
            { k: "Guest reviews", v: f.reviews },
          ]} />
        </>
      )}
      {files.length > 0 && (
        <div className="flex flex-col">
          <h3 className="mb-1 text-[13px] font-semibold text-slate">Uploaded files</h3>
          <ul>
            {files.map((x) => (
              <li key={x.path} className="flex flex-wrap items-center gap-3 border-t border-line-soft py-2">
                <span className="w-48 text-slate">{FILE_CATEGORIES.find((c) => c.key === x.category)?.label}</span>
                {x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-brand">{x.name}</a> : <span className="flex-1">{x.name}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
