import { WEBSITE_STAGES, type Client } from "@/lib/types";
import { buttonClass } from "@/components/ui";
import { Icon } from "@/components/icons";
import { DesignReview } from "./design-review";

const STAGE_TEXT = ["Information received", "Design in progress", "Awaiting your approval", "Development", "Website launched"];

function href(u: string) {
  return u.startsWith("http") ? u : `https://${u}`;
}

// The "Your website" card at the top of the Website page (design: Website.dc.html).
export function WebsiteCard({ company, live }: { company: Client; live: boolean }) {
  const stage = company.website_stage ?? "info_received";
  const si = Math.max(0, WEBSITE_STAGES.findIndex((s) => s.key === stage));
  const domain = company.website_url?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <section aria-label="Your website" className="flex flex-col gap-[18px] rounded-card border border-line px-5 py-[18px] shadow-[0_1px_2px_rgba(0,3,33,0.04)]">
      <div className="flex flex-wrap items-center gap-3.5">
        <span className="inline-flex size-10 flex-none items-center justify-center rounded-[10px] bg-[#F1F2F4] text-forest"><Icon name="browser" size={20} /></span>
        <span className="flex min-w-0 flex-[1_1_220px] flex-col">
          <span className="text-[15px] font-semibold">{company.name}</span>
          <span className="text-slate">{domain ?? "Your new website"}</span>
        </span>
        <span className={"inline-flex h-6 items-center gap-1.5 rounded-badge px-[9px] text-xs font-medium " + (live ? "bg-[#E3F4EA] text-brand" : "bg-[#E8EEFB] text-[#3450A6]")}>
          <span className={"size-1.5 rounded-full " + (live ? "bg-brand" : "bg-[#5B7BE0]")} />
          {live ? "Live" : STAGE_TEXT[si]}
        </span>
        {live && company.website_url && (
          <a href={href(company.website_url)} target="_blank" rel="noreferrer" className={buttonClass("secondary", "h-9 px-3.5")}>Visit website<Icon name="external" size={14} /></a>
        )}
        {live && company.cms_url && (
          <a href={company.cms_url} target="_blank" rel="noreferrer" className={buttonClass("primary", "h-9 px-3.5")}><Icon name="edit" size={15} />Edit content</a>
        )}
      </div>
      {!live && (
        <div className="flex flex-col gap-3.5 border-t border-line-soft pt-4">
          <ol aria-label="Website project" className="grid grid-cols-5 gap-1.5">
            {STAGE_TEXT.map((label, i) => (
              <li key={label} className="flex min-w-0 flex-col gap-2" aria-current={i === si ? "step" : undefined}>
                <span className={"h-1 rounded-full " + (i <= si ? "bg-brand" : "bg-line")} />
                <span className={"text-xs leading-[1.35] " + (i === si ? "font-semibold text-ink" : i < si ? "text-ink" : "text-slate")}>{label}</span>
              </li>
            ))}
          </ol>
          {company.design_review === "pending" && company.website_preview_url ? (
            <DesignReview previewUrl={company.website_preview_url} />
          ) : company.design_review === "changes_requested" && stage === "awaiting_approval" ? (
            <div className="flex flex-col rounded-control border border-[#F1E2C3] bg-[#FFFAF0] px-3.5 py-3">
              <span className="font-semibold">Feedback sent</span>
              <span className="text-[13px] text-body">We&apos;re updating the design and will ask you to review it again.</span>
            </div>
          ) : (
            <span className="text-[13px] text-slate">Safari Digital updates this as your website moves forward.</span>
          )}
        </div>
      )}
    </section>
  );
}
