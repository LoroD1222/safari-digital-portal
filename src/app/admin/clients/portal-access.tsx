"use client";
import { useActionState, useState, useTransition } from "react";
import { Alert, Button, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { addPortalUser, newInviteLink, removePortalUser, type AccessState } from "./access-actions";

type Member = { id: string; email: string; confirmed: boolean };

function CopyLink({ link, email, emailed }: { link: string; email: string; emailed?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-control border border-[#BFE3CF] bg-[#F1FAF6] px-3.5 py-3 text-[13px]">
      <span className="text-forest">
        {emailed
          ? <><strong className="font-semibold">Invite emailed to {email}.</strong> You can also send them this link on WhatsApp. It works once, for 24 hours, and they&apos;ll choose a password when they open it.</>
          : <><strong className="font-semibold">Invite link for {email}.</strong> Send it to them by WhatsApp or email. It works once, for 24 hours, and they&apos;ll choose a password when they open it.</>}
      </span>
      <div className="flex gap-2">
        <Input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} className="h-9 text-xs" />
        <Button type="button" variant="secondary" className="h-9 shrink-0"
          onClick={() => { navigator.clipboard.writeText(link).then(() => setCopied(true)); }}>
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

export function PortalAccess({ clientId, members }: { clientId: string; members: Member[] }) {
  const [state, action] = useActionState<AccessState, FormData>(addPortalUser.bind(null, clientId), {});
  const [resent, setResent] = useState<AccessState | null>(null);
  const [pending, start] = useTransition();
  const shown = resent ?? state;

  return (
    <section aria-labelledby="pa-h" className="flex flex-col gap-4 border-t border-line-soft pt-6">
      <div className="flex flex-col gap-0.5">
        <h2 id="pa-h" className="text-[15px] font-semibold">Portal access</h2>
        <p className="text-[13px] text-slate">People who can sign in and see this client&apos;s portal.</p>
      </div>

      {members.length > 0 ? (
        <ul className="overflow-hidden rounded-card border border-line">
          {members.map((m, i) => (
            <li key={m.id} className={"flex flex-wrap items-center gap-3 px-4 py-3 " + (i ? "border-t border-line-soft" : "")}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{m.email}</span>
                <span className="text-xs text-slate">{m.confirmed ? "Has signed in" : "Invited · hasn't set a password yet"}</span>
              </span>
              {!m.confirmed && (
                <Button type="button" variant="secondary" className="h-8 text-[13px]" disabled={pending}
                  onClick={() => start(async () => setResent(await newInviteLink(clientId, m.email)))}>
                  Send a new invite
                </Button>
              )}
              <Button type="button" variant="ghost" className="h-8 text-[13px]" disabled={pending}
                onClick={() => { if (confirm(`Remove ${m.email}'s access to this portal?`)) start(() => removePortalUser(clientId, m.id)); }}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-card border border-dashed border-field px-4 py-4 text-[13px] text-slate">Nobody can sign in to this portal yet.</p>
      )}

      {shown.error && <Alert>{shown.error}</Alert>}
      {shown.linked && <Alert tone="success">{shown.linked} already had an account and can now see this portal.{shown.emailed ? " We emailed them to let them know." : ""}</Alert>}
      {shown.emailError && <Alert tone="info">{shown.emailError}</Alert>}
      {shown.inviteLink && shown.invited && <CopyLink link={shown.inviteLink} email={shown.invited} emailed={shown.emailed} />}

      <form action={(fd) => { setResent(null); return action(fd); }} className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <label htmlFor="pa-email" className="font-medium">Add someone by email</label>
          <Input id="pa-email" name="email" type="email" placeholder="name@company.com" required />
        </div>
        <SubmitButton variant="secondary" pendingText="Inviting…">Invite</SubmitButton>
        <label className="flex basis-full items-center gap-2 text-[13px] text-body">
          <input type="checkbox" name="send_email" defaultChecked className="size-4 accent-[#1A6647]" />
          Email them the invite (from Safari Digital, with a “Set your password” button)
        </label>
      </form>
    </section>
  );
}
