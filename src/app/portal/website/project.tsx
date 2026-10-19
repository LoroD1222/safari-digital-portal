import { WEBSITE_STAGES, type Client, type WebsiteStage } from "@/lib/types";
import { Badge, buttonClass } from "@/components/ui";
import { Section } from "@/components/blocks";
import { Icon, type IconName } from "@/components/icons";
import { DesignReview } from "./design-review";

// What each stage means for the client, in their words.
const STEPS: Record<WebsiteStage, { icon: IconName; title: string; now: string; done: string }> = {
  info_received: { icon: "clipboard", title: "Information received", now: "We're going through your onboarding answers, photos and itineraries.", done: "We have everything we need to start." },
  design: { icon: "palette", title: "Design", now: "We're designing how your website will look. We'll ask you to review it here.", done: "The design is ready." },
  awaiting_approval: { icon: "eye", title: "Your approval", now: "Look through the design and approve it, or tell us what to change.", done: "You approved the design." },
  development: { icon: "code", title: "Building", now: "We're building the pages, your safari packages and the inquiry form.", done: "Your website is built." },
  live: { icon: "rocket", title: "Live", now: "Your website is online.", done: "Your website is online." },
};

function href(u: string) {
  return u.startsWith("http") ? u : `https://${u}`;
}

export function ProjectStatus({ company, live }: { company: Client; live: boolean }) {
  const stage = company.website_stage ?? "info_received";
  const current = WEBSITE_STAGES.findIndex((s) => s.key === stage);
  const reviewing = company.design_review === "pending" && !!company.website_preview_url;
  return (
    <>
      {/* Status card */}
      <section aria-label="Your website" className="flex flex-wrap items-center gap-4 rounded-card border border-line px-5 py-4">
        <span className={"flex size-11 flex-none items-center justify-center rounded-control " + (live ? "bg-[#E3F4EA] text-brand" : "bg-[#E8EEFB] text-[#3450A6]")}>
          <Icon name={live ? "globe" : STEPS[stage].icon} size={22} />
        </span>
        <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold">{live ? "Your website is live" : STEPS[stage].title}</span>
            {!live && <Badge tone="blue">Step {current + 1} of {WEBSITE_STAGES.length}</Badge>}
          </span>
          <span className="text-[13px] text-body">{live ? (company.website_url ? company.website_url.replace(/^https?:\/\//, "") : "Online") : STEPS[stage].now}</span>
        </span>
        {live && company.website_url && (
          <a href={href(company.website_url)} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>Visit website<Icon name="external" size={14} /></a>
        )}
        {!live && company.website_preview_url && !reviewing && (
          <a href={company.website_preview_url} target="_blank" rel="noreferrer" className={buttonClass("secondary")}><Icon name="eye" size={16} />Preview</a>
        )}
      </section>

    </>
  );
}

export function ProjectTimeline({ company }: { company: Client }) {
  const stage = company.website_stage ?? "info_received";
  const current = WEBSITE_STAGES.findIndex((s) => s.key === stage);
  const reviewing = company.design_review === "pending" && !!company.website_preview_url;
  return (
    <>
      {/* Before launch: the project timeline */}
      {(
        <Section title="Progress">
          <ol className="flex flex-col">
            {WEBSITE_STAGES.map((s, i) => {
              const step = STEPS[s.key];
              const state = i < current ? "done" : i === current ? "now" : "next";
              const last = i === WEBSITE_STAGES.length - 1;
              return (
                <li key={s.key} className="flex gap-3.5" aria-current={state === "now" ? "step" : undefined}>
                  <div className="flex flex-col items-center">
                    <span className={"flex size-9 flex-none items-center justify-center rounded-full border " +
                      (state === "done" ? "border-brand bg-brand text-white" : state === "now" ? "border-mint bg-mint-soft text-forest" : "border-line bg-white text-[#9AA0B4]")}>
                      <Icon name={state === "done" ? "check" : step.icon} size={17} />
                    </span>
                    {!last && <span className={"my-1 w-0.5 flex-1 rounded-full " + (state === "done" ? "bg-brand" : "bg-line")} />}
                  </div>
                  <div className={"flex min-w-0 flex-1 flex-col gap-1 " + (last ? "pb-1" : "pb-6") + " pt-1.5"}>
                    <span className={"font-semibold " + (state === "next" ? "text-slate" : "")}>
                      {step.title}
                      {state === "now" && <span className="ml-2 align-middle"><Badge tone="blue">Now</Badge></span>}
                    </span>
                    {state !== "next" && <span className="text-[13px] text-body">{state === "done" ? step.done : step.now}</span>}
                    {state === "now" && s.key === "awaiting_approval" && (
                      reviewing
                        ? <div className="mt-2"><DesignReview previewUrl={company.website_preview_url!} /></div>
                        : company.design_review === "changes_requested"
                          ? <span className="text-[13px] text-slate">Thanks for your feedback. We&apos;re updating the design and will ask you to look again.</span>
                          : null
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </Section>
      )}

    </>
  );
}
