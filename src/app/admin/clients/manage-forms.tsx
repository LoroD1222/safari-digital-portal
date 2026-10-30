"use client";
import { useActionState, useState, useTransition } from "react";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { WEBSITE_STAGES, type AdReport, type Campaign, type Client } from "@/lib/types";
import {
  requestDesignReview, requestMissingInfo, saveAdReport, saveMeta, saveMetaDataset, savePlan, sendMetaTestEvent, saveWebsiteProject, syncMetaNow, type FormState,
} from "./manage-actions";

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <Alert>{state.error}</Alert>;
  if (state.saved) return <Alert tone="success">{state.message ?? "Saved."}</Alert>;
  return null;
}

export function WebsiteProjectForm({ client }: { client: Client }) {
  const [state, action] = useActionState<FormState, FormData>(saveWebsiteProject.bind(null, client.id), {});
  const [review, setReview] = useState<FormState>({});
  const [pending, start] = useTransition();
  const status = client.design_review;
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Stage" htmlFor="website_stage">
            <Select id="website_stage" name="website_stage" defaultValue={client.website_stage ?? "info_received"}>
              {WEBSITE_STAGES.map((s) => <option key={s.key} value={s.key}>{s.key === "awaiting_approval" ? "Awaiting client approval" : s.label}</option>)}
            </Select>
          </Field>
          <Field label="Design preview link" htmlFor="website_preview_url" optional>
            <Input id="website_preview_url" name="website_preview_url" type="url" placeholder="https://…vercel.app" defaultValue={client.website_preview_url ?? ""} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Sanity Studio link" htmlFor="cms_url" optional hint="Shows an “Edit content” button on the client's Website page.">
              <Input id="cms_url" name="cms_url" type="url" placeholder="https://goldentrips.sanity.studio" defaultValue={client.cms_url ?? ""} />
            </Field>
          </div>
        </div>
        <p className="text-xs text-slate">Setting the stage to <em>Awaiting client approval</em> sends the preview link to the client, who can approve it or ask for changes on their Website page.</p>
        <Feedback state={state} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SubmitButton variant="secondary">Save</SubmitButton>
        </div>
      </form>
      <div className="flex flex-wrap items-center gap-3 rounded-control bg-sidebar px-3.5 py-3">
        <span className="flex min-w-[200px] flex-1 flex-col text-[13px]">
          <span className="font-medium">Design review</span>
          <span className="text-slate">
            {status === "pending" ? "Waiting for the client." : status === "approved" ? "The client approved the design." : status === "changes_requested" ? "The client asked for changes." : "Send the preview link to the client to approve."}
          </span>
          {client.design_feedback && <span className="mt-1 whitespace-pre-wrap text-body">“{client.design_feedback}”</span>}
        </span>
        <Button type="button" variant="secondary" disabled={pending || !client.website_preview_url}
          onClick={() => start(async () => setReview(await requestDesignReview(client.id)))}>
          {pending ? "Sending…" : status === "pending" ? "Send again" : "Ask client to review"}
        </Button>
      </div>
      <Feedback state={review} />
    </div>
  );
}

export function PlanForm({ client }: { client: Client }) {
  const [state, action] = useActionState<FormState, FormData>(savePlan.bind(null, client.id), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-32"><Field label="Reels a month" htmlFor="plan_reels"><Input id="plan_reels" name="plan_reels" type="number" min={0} defaultValue={client.plan_reels ?? ""} /></Field></div>
        <div className="w-32"><Field label="Posts a month" htmlFor="plan_posts"><Input id="plan_posts" name="plan_posts" type="number" min={0} defaultValue={client.plan_posts ?? ""} /></Field></div>
        <SubmitButton variant="secondary">Save</SubmitButton>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function MissingInfoForm({ client }: { client: Client }) {
  const [state, action] = useActionState<FormState, FormData>(requestMissingInfo.bind(null, client.id), {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <Field label="What's missing?" htmlFor="onboarding_note" hint="The client sees this on their dashboard and gets an email.">
        <Textarea id="onboarding_note" name="onboarding_note" rows={3} placeholder="Please share your logo and 10 more safari photos." defaultValue={client.onboarding_note ?? ""} />
      </Field>
      <Feedback state={state} />
      <div className="flex justify-end"><SubmitButton variant="secondary" pendingText="Sending…">Ask the client</SubmitButton></div>
    </form>
  );
}

export function MetaForm({ client, accounts, accountsError }: { client: Client; accounts?: { id: string; name: string }[] | null; accountsError?: string | null }) {
  const [state, action] = useActionState<FormState, FormData>(saveMeta.bind(null, client.id), {});
  const [sync, setSync] = useState<FormState>({});
  const [pending, start] = useTransition();
  const current = client.meta_ad_account_id ?? "";
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-col gap-3">
        <label className="flex items-center gap-2.5 font-medium">
          <input type="checkbox" name="meta_access_confirmed" defaultChecked={!!client.meta_access_confirmed} className="size-4 accent-[#1A6647]" />
          Access confirmed in Meta Business Suite
        </label>
        {accounts ? (
          <Field label="Ad account" htmlFor="meta_ad_account_id" hint="Accounts assigned to the Portal system user in Business Suite.">
            <Select id="meta_ad_account_id" name="meta_ad_account_id" defaultValue={current}>
              <option value="">Not connected</option>
              {current && !accounts.some((a) => a.id === current) && <option value={current}>{current} (not visible to the system user)</option>}
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.id.replace("act_", "")}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Ad account ID" htmlFor="meta_ad_account_id" optional hint={accountsError ?? "Business Suite → Ad accounts. Used for automatic ad results."}>
            <Input id="meta_ad_account_id" name="meta_ad_account_id" inputMode="numeric" defaultValue={current.replace(/^act_/, "")} />
          </Field>
        )}
        <Feedback state={state} />
        <div className="flex justify-end"><SubmitButton variant="secondary">Save</SubmitButton></div>
      </form>
      {accounts && current && (
        <div className="flex flex-wrap items-center gap-3 rounded-control bg-sidebar px-3.5 py-3">
          <span className="min-w-[200px] flex-1 text-[13px] text-body">Ad results sync automatically every hour. Sync now to update straight away.</span>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => start(async () => setSync(await syncMetaNow(client.id)))}>
            {pending ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      )}
      <Feedback state={sync} />
    </div>
  );
}

type Row = Campaign & { key: number };

export function AdReportForm({ clientId, month, report, trackedInquiries }: { clientId: string; month: string; report: AdReport | null; trackedInquiries: number }) {
  const [state, action] = useActionState<FormState, FormData>(saveAdReport.bind(null, clientId), {});
  const [rows, setRows] = useState<Row[]>(() => (report?.campaigns ?? []).map((c, i) => ({ ...c, key: i })));
  const [spend, setSpend] = useState(String(report?.meta_spend ?? ""));
  const [leads, setLeads] = useState(String(report?.meta_inquiries ?? ""));
  const cpi = Number(leads) > 0 ? Number(spend) / Number(leads) : null;
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="month" value={month} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Meta ad spend (USD)" htmlFor="meta_spend">
          <Input id="meta_spend" name="meta_spend" type="number" min={0} step="0.01" value={spend} onChange={(e) => setSpend(e.target.value)} />
        </Field>
        <Field label="Inquiries from Meta ads" htmlFor="meta_inquiries" hint="Results in Ads Manager.">
          <Input id="meta_inquiries" name="meta_inquiries" type="number" min={0} value={leads} onChange={(e) => setLeads(e.target.value)} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="font-medium">Cost per Meta inquiry</span>
          <span className="flex h-10 items-center text-lg font-semibold tabular-nums">{cpi === null ? "—" : `$${cpi.toFixed(2)}`}</span>
          <span className="text-xs text-slate">Worked out for you</span>
        </div>
      </div>
      <p className="text-[13px] text-slate">Total tracked inquiries this month (all sources, from the Inquiries list): <span className="font-medium text-ink">{trackedInquiries}</span></p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-medium">Campaigns <span className="font-normal text-slate">· optional</span></legend>
        {rows.length > 0 && (
          <div aria-hidden="true" className="hidden grid-cols-[1fr_7rem_7rem_6rem_2rem] gap-2 text-xs text-slate sm:grid">
            <span>Name</span><span>Status</span><span>Spend ($)</span><span>Inquiries</span><span />
          </div>
        )}
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[1fr_1fr_2rem] gap-2 border-b border-line-soft pb-2 sm:grid-cols-[1fr_7rem_7rem_6rem_2rem] sm:border-0 sm:pb-0">
            <Input name="c_name" aria-label={`Campaign ${i + 1} name`} defaultValue={r.name} className="col-span-2 sm:col-span-1" placeholder="Serengeti safari – US & UK" />
            <Select name="c_status" aria-label={`Campaign ${i + 1} status`} defaultValue={r.status} className="col-start-1 row-start-2 sm:col-start-auto sm:row-start-auto">
              <option value="active">Active</option><option value="paused">Paused</option><option value="ended">Ended</option>
            </Select>
            <Input name="c_spend" aria-label={`Campaign ${i + 1} spend`} type="number" min={0} step="0.01" defaultValue={r.spend || ""} placeholder="Spend $" />
            <Input name="c_inquiries" aria-label={`Campaign ${i + 1} inquiries`} type="number" min={0} defaultValue={r.inquiries || ""} placeholder="Inquiries" className="col-start-1 sm:col-start-auto" />
            <button type="button" aria-label={`Remove campaign ${i + 1}`} onClick={() => setRows(rows.filter((x) => x.key !== r.key))} className="col-start-3 row-start-1 h-10 w-8 text-lg text-slate hover:text-ink sm:col-start-auto sm:row-start-auto">×</button>
          </div>
        ))}
        <button type="button" onClick={() => setRows([...rows, { key: Date.now(), name: "", status: "active", spend: 0, inquiries: 0 }])}
          className="w-fit text-[13px] font-medium text-brand hover:underline">+ Add campaign</button>
      </fieldset>

      <Field label="Note for the client" htmlFor="note" optional>
        <Textarea id="note" name="note" rows={2} defaultValue={report?.note ?? ""} placeholder="Strong month for the Kilimanjaro campaign; we'll shift budget there in November." />
      </Field>
      <Feedback state={state} />
      <div className="flex justify-end border-t border-line-soft pt-4"><SubmitButton>Save report</SubmitButton></div>
    </form>
  );
}

export function MetaEventsForm({ clientId, datasetId, hasToken }: { clientId: string; datasetId: string | null; hasToken: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(saveMetaDataset.bind(null, clientId), {});
  const [test, setTest] = useState<FormState>({});
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {/* Not a login form: no password field, so browsers don't auto-fill an email + saved password here. */}
      <form action={action} autoComplete="off" data-1p-ignore data-lpignore="true" data-form-type="other" className="flex flex-col gap-3">
        <Field label="Dataset ID" htmlFor="meta_dataset_id" hint="Events Manager → the client's dataset (pixel) → Settings. Leave empty to turn events off.">
          <Input id="meta_dataset_id" name="meta_dataset_id" inputMode="numeric" autoComplete="off" data-1p-ignore data-lpignore="true" defaultValue={datasetId ?? ""} placeholder="e.g. 1995031924787890" />
        </Field>
        <Field label="Dataset access token" htmlFor="meta_capi_token" optional
          hint={hasToken ? "A token is saved (hidden). Paste a new one to replace it." : "Only if the dataset can't be shared with Safari Digital yet: Events Manager → dataset → Settings → Conversions API → Generate access token."}>
          <Input id="meta_capi_token" name="meta_capi_token" type="text" autoComplete="off" spellCheck={false} data-1p-ignore data-lpignore="true"
            style={{ WebkitTextSecurity: "disc" } as React.CSSProperties} placeholder={hasToken ? "••••••••  saved" : "Paste token (starts with EAA)"} />
        </Field>
        {hasToken && (
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" name="clear_capi_token" className="size-4 accent-[#1A6647]" />
            Remove the saved token and use the Safari Portal system user instead
          </label>
        )}
        <div className="flex justify-end"><SubmitButton variant="secondary">Save</SubmitButton></div>
      </form>
      <Feedback state={state} />
      {datasetId && (
        <div className="flex flex-wrap items-center gap-3 rounded-control bg-sidebar px-3.5 py-3">
          <span className="min-w-[200px] flex-1 text-[13px] text-body">Check the connection: copy the test code from Events Manager → Test events, then send a test lead.</span>
          <Input aria-label="Test event code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="TEST12345" className="h-9 w-32" />
          <Button type="button" variant="secondary" className="h-9" disabled={pending || !code.trim()} onClick={() => start(async () => setTest(await sendMetaTestEvent(clientId, code)))}>
            {pending ? "Sending…" : "Send test event"}
          </Button>
        </div>
      )}
      <Feedback state={test} />
    </div>
  );
}
