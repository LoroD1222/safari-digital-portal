"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Icon, type IconName } from "./icons";
import { Alert, Badge, Button, Input, Select, Textarea } from "./ui";
import { ConfirmDialog } from "./confirm-dialog";
import {
  FOLLOWUP_DAYS, FOLLOWUP_STAGES, TEMPLATES, TEMPLATE_KEYS, TOKENS, fillTokens, presetByKey,
  type FollowupRule, type FollowupStage, type TemplateKey,
} from "@/lib/followup-presets";
import { INQUIRY_LABEL } from "@/lib/types";
import {
  addRule, chooseTemplate, deleteRule, logWhatsappFollowup, resetRule, saveRule, setFollowupsEnabled, type RulePatch,
} from "@/app/portal/followups/actions";

export type WhatsappDue = { inquiryId: string; ruleId: string; guest: string; trip: string; stage: string; days: number; ruleName: string; url: string };
export type RecentSend = { id: string; guest: string; name: string; channel: "email" | "whatsapp"; status: string; at: string };

const STAGE_DOT: Record<FollowupStage, string> = { contacted: "#E0A458", quoted: "#8B6FE0", negotiating: "#E07B3A" };
const dayWord = (n: number) => (n === 1 ? "day" : "days");

function Switch({ on, label, onChange, disabled, size = "md" }: { on: boolean; label: string; onChange: () => void; disabled?: boolean; size?: "md" | "lg" }) {
  const w = size === "lg" ? "w-12 h-7" : "w-10 h-6";
  const k = size === "lg" ? "size-[22px]" : "size-[18px]";
  const left = size === "lg" ? (on ? "left-[23px]" : "left-[3px]") : on ? "left-[19px]" : "left-[3px]";
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange} disabled={disabled}
      className={`relative shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${w} ${on ? "bg-brand" : "bg-[#C9CDD6]"}`}>
      <span className={`absolute top-[3px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,3,33,0.25)] transition-[left] ${k} ${left}`} />
    </button>
  );
}

export function FollowupsManager(p: {
  company: string; enabled: boolean; template: TemplateKey; senderReady: boolean; fromEmail: string | null;
  rules: FollowupRule[]; whatsapp: WhatsappDue[]; recent: RecentSend[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(p.enabled);
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState<TemplateKey>(p.template);
  const [stage, setStage] = useState<FollowupStage | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [tapped, setTapped] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  // What a template change removes: every template follow-up (with any edits). The client's own ones stay.
  const presetRules = p.rules.filter((r) => r.preset);
  const ownRules = p.rules.filter((r) => !r.preset);
  const isEdited = (r: FollowupRule) => {
    const base = presetByKey(r.preset);
    return !!base && (base.subject !== r.subject || base.body !== r.body || base.days !== r.days || base.name !== r.name);
  };
  const editedCount = presetRules.filter(isEdited).length;
  const restoring = pick === p.template;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) setError(r.error ?? "Something went wrong.");
    else { after?.(); router.refresh(); }
  });

  const toggleAll = () => {
    const next = !enabled;
    setEnabled(next);
    start(async () => {
      setError(null);
      const r = await setFollowupsEnabled(next, p.template);
      if (!r.ok) { setEnabled(!next); setError(r.error); } else router.refresh();
    });
  };

  const onCount = p.rules.filter((r) => r.enabled).length;
  const stagesWithRules = FOLLOWUP_STAGES.filter((s) => p.rules.some((r) => r.stage === s));
  const groups = FOLLOWUP_STAGES
    .filter((s) => stage === "all" || s === stage)
    .map((s) => ({ stage: s, rules: p.rules.filter((r) => r.stage === s).sort((a, b) => a.days - b.days) }))
    .filter((g) => g.rules.length);
  const whatsapp = p.whatsapp.filter((w) => !tapped.includes(w.inquiryId));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Follow-ups</h1>
        <p className="text-slate">Friendly reminders to guests who haven&apos;t replied yet, so no inquiry is forgotten.</p>
      </header>

      {/* The main switch. Off for everyone until they turn it on. */}
      <section aria-label="Follow-ups on or off" className={`flex flex-col overflow-hidden rounded-card border ${enabled ? "border-[#BFE3CF] bg-[#F1FAF6]" : "border-line bg-white"}`}>
        <div className="flex items-center gap-4 px-5 py-4">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-control ${enabled ? "bg-white text-brand" : "bg-sidebar text-slate"}`}><Icon name="mail" size={20} /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[15px] font-semibold">{enabled ? "Follow-ups are on" : "Follow-ups are off"}</span>
          <span className="text-[13px] text-slate">
            {enabled
              ? p.senderReady ? `${onCount} ${onCount === 1 ? "follow-up is" : "follow-ups are"} switched on. Emails go from ${p.fromEmail} every morning at 9:00.`
                : `${onCount} ${onCount === 1 ? "follow-up is" : "follow-ups are"} switched on. Emails start once your address is connected.`
              : "Nothing is sent. Turn on to send the follow-ups below automatically."}
          </span>
        </span>
        <Switch size="lg" on={enabled} label={enabled ? "Turn follow-ups off" : "Turn follow-ups on"} onChange={toggleAll} disabled={pending} />
        </div>
        {/* Is the client's email address connected? Without it only WhatsApp follow-ups work. */}
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-5 py-2.5 text-[13px] ${enabled ? "border-[#D4EBDD]" : "border-line-soft"} ${p.senderReady ? "bg-white/60" : "bg-[#FFFAF0]"}`}>
          {p.senderReady ? (
            <>
              <span className="inline-flex items-center gap-1.5 font-semibold text-forest"><span className="inline-flex size-4 items-center justify-center rounded-full bg-brand text-white"><Icon name="check" size={10} /></span>Email connected</span>
              <span className="min-w-0 flex-1 text-body">Follow-ups go from <span className="font-medium text-ink">{p.fromEmail}</span>, and guests&apos; replies come back to it.</span>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#8A5A12]"><span className="size-2 rounded-full bg-[#E0A458]" />Email not connected yet</span>
              <span className="min-w-[220px] flex-1 text-[#8A5A12]">Safari Digital connects your own address (like bookings@yourcompany.com) so follow-ups come from you. Until then, only WhatsApp follow-ups work.</span>
              <Link href="/portal/requests" className="font-semibold text-[#8A5A12] underline-offset-2 hover:underline">Ask Safari Digital</Link>
            </>
          )}
        </div>
      </section>

      {error && <Alert>{error}</Alert>}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section aria-label="Your follow-ups" className={`flex min-w-0 flex-col gap-4 ${enabled ? "" : "opacity-[0.85]"}`}>
          {enabled && whatsapp.length > 0 && (
            <div className="flex flex-col overflow-hidden rounded-card border border-line">
              <div className="flex flex-wrap items-center gap-2 border-b border-line bg-sidebar px-4 py-2.5">
                <Icon name="whatsapp" size={16} className="text-brand" />
                <h2 className="text-[13px] font-semibold">Send on WhatsApp today</h2>
                <span className="text-xs text-slate">· {whatsapp.length} {whatsapp.length === 1 ? "guest" : "guests"} with a phone number</span>
              </div>
              <ul className="divide-y divide-[#EEF0F2]">
                {whatsapp.map((w) => (
                  <li key={w.inquiryId} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="flex min-w-[180px] flex-1 flex-col">
                      <span className="font-semibold">{w.guest}</span>
                      <span className="text-xs text-slate">{w.trip} · {w.stage} for {w.days} {dayWord(w.days)} · {w.ruleName}</span>
                    </span>
                    <a href={w.url} target="_blank" rel="noopener noreferrer"
                      onClick={() => { setTapped((t) => [...t, w.inquiryId]); run(() => logWhatsappFollowup(w.inquiryId, w.ruleId)); }}
                      className="inline-flex h-9 items-center gap-1.5 rounded-control bg-brand px-3 text-[13px] font-semibold text-white no-underline hover:bg-brand-hover">
                      <Icon name="whatsapp" size={15} />Send on WhatsApp
                    </a>
                  </li>
                ))}
              </ul>
              <p className="border-t border-line px-4 py-2 text-xs text-slate">Each tap opens WhatsApp with the message written. Press send there, then come back for the next one.</p>
            </div>
          )}

          {!picking ? (
            <div className="flex items-center gap-4 rounded-card border border-[#D4EBDD] bg-[#F1FAF6] px-4 py-3">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-brand">Template</span>
                <span className="truncate text-forest"><span className="font-semibold">{TEMPLATES[p.template].title}</span> <span className="text-body">· {p.template === "blank" ? "only follow-ups you write" : "by Safari Digital"} · {onCount} of {p.rules.length} on</span></span>
              </span>
              <button type="button" onClick={() => { setPick(p.template); setPicking(true); }} className="inline-flex h-8 items-center gap-1 rounded-control px-2 text-[13px] font-semibold text-brand hover:bg-white">
                Change<Icon name="chevronRight" size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-card border border-line bg-sidebar p-4">
              <div className="flex flex-col">
                <span className="font-semibold">Choose a starting template</span>
                <span className="text-xs text-slate">Written by Safari Digital. You can still edit every email, and your own follow-ups stay.</span>
              </div>
              <div role="radiogroup" aria-label="Templates" className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                {TEMPLATE_KEYS.map((k) => {
                  const sel = pick === k;
                  return (
                    <button key={k} type="button" role="radio" aria-checked={sel} onClick={() => setPick(k)}
                      className={`flex flex-col items-start gap-1.5 rounded-control border bg-white p-3.5 text-left ${sel ? "border-brand shadow-[0_0_0_1px_#1A6647]" : "border-line"}`}>
                      <span className="flex items-center gap-2">
                        <span className={`size-4 shrink-0 rounded-full bg-white ${sel ? "border-[5px] border-brand" : "border-[1.5px] border-[#B7BCC8]"}`} />
                        <span className="font-semibold">{TEMPLATES[k].title}</span>
                      </span>
                      <span className="text-xs font-medium text-body">
                        {k === "blank" ? "No follow-ups" : `${TEMPLATES[k].presets.length} follow-ups`}{k === "standard" && <span className="text-brand"> · Recommended</span>}
                      </span>
                      <span className="text-xs leading-[1.45] text-slate">{TEMPLATES[k].note}</span>
                      {p.template === k && <span className="text-[11px] font-semibold text-brand">In use now</span>}
                    </button>
                  );
                })}
              </div>
              <p className="rounded-control border border-[#F1E2C3] bg-[#FFFAF0] px-3 py-2 text-[13px] text-[#8A5A12]">
                {restoring
                  ? <>Restoring puts back Safari Digital&apos;s {presetRules.length} {TEMPLATES[pick].title} follow-ups{editedCount ? <> and <span className="font-semibold">removes your changes to {editedCount}</span></> : ""}.</>
                  : <>This <span className="font-semibold">removes your {presetRules.length} template follow-ups</span>{editedCount ? ` (${editedCount} with your changes)` : ""}{pick === "blank" ? ". You start with no Safari Digital follow-ups." : ` and adds the ${TEMPLATES[pick].presets.length} from ${TEMPLATES[pick].title}.`}</>}
                {" "}{pick !== "blank" && <>Which ones are on goes back to the template&apos;s choice.{" "}</>}{ownRules.length ? `Your own ${ownRules.length === 1 ? "follow-up stays" : `${ownRules.length} follow-ups stay`}.` : "Follow-ups you added yourself would stay."}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" className="h-9" onClick={() => setPicking(false)}>Cancel</Button>
                <Button className="h-9" disabled={pending} onClick={() => setConfirming(true)}>
                  {restoring ? `Restore ${TEMPLATES[pick].title}` : `Switch to ${TEMPLATES[pick].title}`}
                </Button>
              </div>
            </div>
          )}

          {stagesWithRules.length > 1 && (
            <div role="group" aria-label="Show stage" className="flex flex-wrap gap-1.5">
              {(["all", ...stagesWithRules] as const).map((s) => (
                <button key={s} type="button" aria-pressed={stage === s} onClick={() => setStage(s)}
                  className={`h-8 whitespace-nowrap rounded-full border px-3 text-[13px] font-medium ${stage === s ? "border-forest bg-forest text-white" : "border-field bg-white text-body"}`}>
                  {s === "all" ? "All stages" : INQUIRY_LABEL[s]}
                </button>
              ))}
            </div>
          )}

          {p.rules.length === 0 && (
            <div className="flex flex-col items-center gap-1 rounded-card border border-dashed border-field px-5 py-8 text-center">
              <span className="font-semibold">No follow-ups yet</span>
              <span className="max-w-sm text-[13px] text-slate">Write your own below, or choose a Safari Digital template to start from.</span>
            </div>
          )}

          {groups.map((g) => (
            <div key={g.stage} className="overflow-hidden rounded-card border border-line bg-white">
              <div className="flex items-center gap-2 border-b border-[#EEF0F2] bg-sidebar px-4 py-2.5">
                <span className="size-2 rounded-full" style={{ background: STAGE_DOT[g.stage] }} />
                <h2 className="text-[13px] font-semibold">While in {INQUIRY_LABEL[g.stage]}</h2>
                <span className="ml-auto text-xs text-slate">{g.rules.filter((r) => r.enabled).length} of {g.rules.length} on</span>
              </div>
              <ul className="divide-y divide-[#EEF0F2]">
                {g.rules.map((r) => (
                  <RuleRow key={r.id} rule={r} company={p.company} open={open === r.id} pending={pending}
                    onOpen={() => setOpen(open === r.id ? null : r.id)}
                    onToggle={() => run(() => saveRule(r.id, { enabled: !r.enabled }))}
                    onSave={(patch) => run(() => saveRule(r.id, patch), () => setOpen(null))}
                    onReset={() => run(() => resetRule(r.id))}
                    onDelete={() => run(() => deleteRule(r.id), () => setOpen(null))} />
                ))}
              </ul>
            </div>
          ))}

          <button type="button" disabled={pending}
            onClick={() => start(async () => {
              setError(null);
              const r = await addRule(stage === "all" ? "quoted" : stage);
              if (!r.ok) setError(r.error); else { setOpen(r.id); router.refresh(); }
            })}
            className="inline-flex h-10 items-center gap-1.5 self-start rounded-control border border-dashed border-[#B7BCC8] bg-white px-3.5 text-[13px] font-semibold hover:bg-[#F4F5F2] disabled:opacity-60">
            <Icon name="plus" size={15} />Add your own follow-up
          </button>
        </section>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
          <div className="flex flex-col gap-3.5 rounded-card bg-sidebar p-[18px]">
            <h2 className="text-[15px] font-semibold">How follow-ups work</h2>
            <ol className="flex flex-col gap-3.5">
              {([
                ["inbox", "An inquiry waits", "It stays in the same stage on your Pipeline, for example Quote sent."],
                ["clock", "The days pass", "After the wait you set, the follow-up goes out once."],
                ["send", "From your address", "Guests reply straight to you. Move the card on the Pipeline and the follow-ups stop."],
              ] as [IconName, string, string][]).map(([icon, t, d], i) => (
                <li key={t} className="flex flex-col items-start gap-2">
                  <span className="flex size-8 items-center justify-center rounded-control bg-white text-brand shadow-[0_0_0_1px_#E6E8EC]"><Icon name={icon} size={17} /></span>
                  <span className="text-[13px] text-body">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-brand">Step {i + 1}</span>
                    <span className="block font-semibold text-ink">{t}</span>{d}
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-slate">Every guest with a phone number also appears under &quot;Send on WhatsApp today&quot; when a follow-up is due, so you can message them too. If a guest asks you to stop, switch off follow-ups on their card in the Pipeline.</p>
            <Link href="/portal/pipeline" className="text-[13px] font-medium text-brand no-underline">Open the Pipeline →</Link>
          </div>
          {p.recent.length > 0 && (
            <div className="flex flex-col gap-2 rounded-card border border-line p-4">
              <h2 className="text-[13px] font-semibold">Recently sent</h2>
              <ul className="flex flex-col gap-2">
                {p.recent.map((s) => (
                  <li key={s.id} className="flex flex-col text-xs">
                    <span className="font-medium text-ink">{s.guest}</span>
                    <span className="text-slate">
                      {s.channel === "whatsapp" ? "WhatsApp" : "Email"} · {s.name} · {new Date(s.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {s.status === "failed" && <span className="text-danger-text"> · not delivered</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
      {confirming && (
        <ConfirmDialog
          title={restoring ? `Restore the ${TEMPLATES[pick].title} template?` : `Switch to the ${TEMPLATES[pick].title} template?`}
          confirmLabel={restoring ? "Restore" : "Replace follow-ups"} pendingLabel="Saving…" pending={pending} error={error}
          onClose={() => setConfirming(false)}
          onConfirm={() => run(() => chooseTemplate(pick, enabled), () => { setConfirming(false); setPicking(false); setOpen(null); })}>
          <div className="flex flex-col gap-2.5">
            <span className="font-semibold text-ink">{restoring ? "These go back to Safari Digital's text:" : "These will be removed:"}</span>
            <ul className="flex flex-col gap-1">
              {presetRules.map((r) => (
                <li key={r.id} className="flex items-center gap-2"><span className="size-1.5 shrink-0 rounded-full bg-danger" />{r.name}{isEdited(r) && <span className="text-danger-text">· your changes are lost</span>}</li>
              ))}
            </ul>
            {!restoring && <span>{pick === "blank" ? "Nothing replaces them: you write your own follow-ups." : `They're replaced by ${TEMPLATES[pick].presets.length} follow-ups from ${TEMPLATES[pick].title}.`}</span>}
            {ownRules.length > 0 && (
              <span><span className="font-semibold text-ink">These stay:</span> {ownRules.map((r) => r.name).join(", ")} (your own).</span>
            )}
            <span className="text-slate">This can&apos;t be undone.</span>
          </div>
        </ConfirmDialog>
      )}
    </div>
  );
}

function RuleRow({ rule, company, open, pending, onOpen, onToggle, onSave, onReset, onDelete }: {
  rule: FollowupRule; company: string; open: boolean; pending: boolean;
  onOpen: () => void; onToggle: () => void; onSave: (p: RulePatch) => void; onReset: () => void; onDelete: () => void;
}) {
  const own = !rule.preset;
  const preset = presetByKey(rule.preset);
  const [d, setD] = useState({ name: rule.name, stage: rule.stage, days: rule.days, subject: rule.subject, body: rule.body });
  const [seen, setSeen] = useState(rule);
  if (rule !== seen) { setSeen(rule); setD({ name: rule.name, stage: rule.stage, days: rule.days, subject: rule.subject, body: rule.body }); }
  const changed = d.name !== rule.name || d.stage !== rule.stage || d.days !== rule.days || d.subject !== rule.subject || d.body !== rule.body;
  const edited = !!preset && (preset.subject !== rule.subject || preset.body !== rule.body || preset.days !== rule.days || preset.name !== rule.name);
  // Tags go in where the cursor is, in the subject or the message (whichever was used last).
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const last = useRef<"subject" | "body">("body");
  const insert = (t: string) => {
    const field = last.current;
    const el = field === "subject" ? subjectRef.current : bodyRef.current;
    const text = d[field];
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + t + text.slice(end);
    setD({ ...d, [field]: next });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + t.length, start + t.length); });
  };
  const example = { name: TOKENS[0].example, trip: TOKENS[1].example, company };
  const id = `fu-${rule.id}`;

  return (
    <li className={open ? "bg-[#FBFCFA]" : ""}>
      <div className="grid grid-cols-[64px_minmax(0,1fr)_40px] items-center gap-x-3.5 px-4 py-3">
        <span className={`flex h-11 flex-col items-center justify-center rounded-control ${rule.enabled ? "bg-[#E3F4EA] text-forest" : "bg-[#F1F2F4] text-slate"}`}>
          <span className="text-base font-semibold leading-none">{rule.days}</span>
          <span className="text-[11px]">{dayWord(rule.days)}</span>
        </span>
        <button type="button" onClick={onOpen} aria-expanded={open} aria-controls={id}
          className={`flex min-w-0 flex-col items-start gap-0.5 text-left ${rule.enabled ? "text-ink" : "text-slate"}`}>
          <span className="flex max-w-full items-center gap-2">
            <span className="truncate font-semibold hover:underline">{rule.name}</span>
            {own && <span className="shrink-0"><Badge tone="green">Yours</Badge></span>}
          </span>
          <span className="max-w-full truncate text-xs text-slate">{rule.enabled ? "" : "Off · "}{rule.subject}</span>
        </button>
        <Switch on={rule.enabled} label={(rule.enabled ? "Turn off: " : "Turn on: ") + rule.name} onChange={onToggle} disabled={pending} />
      </div>
      {open && (
        <div id={id} className="flex flex-col gap-3 px-4 pb-4 sm:pl-[94px]">
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_150px]">
            {own ? (
              <label className="flex flex-col gap-1.5 text-[13px] font-medium">Name
                <Input value={d.name} maxLength={80} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
            ) : (
              <span className="flex flex-col gap-1.5 text-[13px] font-medium">Stage
                <span className="flex h-10 items-center rounded-control border border-[#EEF0F2] bg-sidebar px-3 font-normal text-body">{INQUIRY_LABEL[rule.stage]}</span></span>
            )}
            <label className="flex flex-col gap-1.5 text-[13px] font-medium">Send after
              <Select value={d.days} onChange={(e) => setD({ ...d, days: Number(e.target.value) })}>
                {FOLLOWUP_DAYS.map((n) => <option key={n} value={n}>{n} {dayWord(n)}</option>)}
              </Select></label>
          </div>
          {own && (
            <label className="flex flex-col gap-1.5 text-[13px] font-medium">When the inquiry is in
              <Select value={d.stage} onChange={(e) => setD({ ...d, stage: e.target.value as FollowupStage })}>
                {FOLLOWUP_STAGES.map((s) => <option key={s} value={s}>{INQUIRY_LABEL[s]}</option>)}
              </Select></label>
          )}
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">Subject
            <Input ref={subjectRef} value={d.subject} maxLength={150} onFocus={() => { last.current = "subject"; }} onChange={(e) => setD({ ...d, subject: e.target.value })} /></label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">Message
            <Textarea ref={bodyRef} rows={10} value={d.body} maxLength={4000} onFocus={() => { last.current = "body"; }} onChange={(e) => setD({ ...d, body: e.target.value })} className="leading-[1.55]" /></label>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate">Add a tag:
              {TOKENS.map((t) => (
                <button key={t.token} type="button" title={t.help} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(t.token)}
                  className="h-6 rounded-[6px] border border-field bg-sidebar px-2 text-xs font-medium text-body hover:bg-white">{t.token}</button>
              ))}
            </div>
            <span className="text-xs text-slate">Tags fill in for each guest: [First name] becomes Sarah, [Trip] becomes what they asked about (like Kilimanjaro climb), [Company name] becomes {company}.</span>
          </div>
          <div className="flex flex-col gap-1 rounded-control border border-line-soft bg-sidebar px-3.5 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate">Preview for Sarah, asking about a Kilimanjaro climb</span>
            <span className="text-[13px] font-semibold">{fillTokens(d.subject, example)}</span>
            <span className="line-clamp-4 whitespace-pre-line text-[13px] text-body">{fillTokens(d.body, example)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button className="h-9" disabled={!changed || pending} onClick={() => onSave(own ? d : { days: d.days, subject: d.subject, body: d.body })}>Save</Button>
            {changed && <button type="button" onClick={() => setD({ name: rule.name, stage: rule.stage, days: rule.days, subject: rule.subject, body: rule.body })} className="text-[13px] font-medium text-slate hover:text-ink">Cancel</button>}
            <span className="flex-1" />
            {edited && !changed && <button type="button" onClick={onReset} disabled={pending} className="text-[13px] font-medium text-brand">Use Safari Digital&apos;s text again</button>}
            {own && <button type="button" onClick={onDelete} disabled={pending} className="text-[13px] font-medium text-danger-text">Delete</button>}
          </div>
        </div>
      )}
    </li>
  );
}
