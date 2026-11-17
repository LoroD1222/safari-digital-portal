"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Textarea } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import type { SeoKeyword, SeoWork } from "@/lib/seo";
import { addSeoKeywords, removeSeoKeyword, saveSeoWork, searchConsoleSites, setSearchConsoleSite, syncSeoNow } from "./seo-actions";

type Msg = { ok: boolean; text: string } | null;
const Note = ({ m }: { m: Msg }) => m && <p role="status" className={`text-[13px] ${m.ok ? "text-forest" : "text-danger-text"}`}>{m.text}</p>;

function Box({ title, note, right, children }: { title: string; note?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5"><h2 className="text-[15px] font-semibold">{title}</h2>{note && <p className="text-[13px] text-slate">{note}</p>}</div>
        {right}
      </div>
      {children}
    </section>
  );
}

// Search Console connection: the service email to share, the property, and sync.
export function SearchConsoleCard({ clientId, site, email, syncedAt, error }: { clientId: string; site: string | null; email: string | null; syncedAt: string | null; error: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sites, setSites] = useState<string[] | null>(null);
  const [value, setValue] = useState(site ?? "");
  const [msg, setMsg] = useState<Msg>(null);
  const run = (f: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    setMsg(null);
    const r = await f();
    setMsg(r.ok ? (r.message ? { ok: true, text: r.message } : null) : { ok: false, text: r.error ?? "Didn't work." });
    router.refresh();
  });
  const load = () => start(async () => {
    setMsg(null);
    const r = await searchConsoleSites();
    if (r.ok) { setSites(r.sites); if (!r.sites.length) setMsg({ ok: false, text: "No properties shared with the portal yet. The client adds the email above in Search Console → Settings → Users and permissions." }); }
    else setMsg({ ok: false, text: r.error });
  });
  return (
    <Box title="Google Search Console" right={site ? <Badge tone={error ? "red" : "green"}>{error ? "Sync failed" : "Connected"}</Badge> : <Badge tone="amber">Not connected</Badge>}
      note={site ? <>Property <span className="font-mono text-ink">{site}</span>{syncedAt ? <> · synced {new Date(syncedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dar_es_Salaam" })}</> : null}. Syncs every morning.</> : "Connect the client's Search Console property to show their Google results."}>
      {!email ? (
        <p className="rounded-control bg-[#FFF7E8] px-3 py-2 text-[13px] text-[#8A5A12]">Add <span className="font-mono">GOOGLE_SERVICE_ACCOUNT</span> in Vercel (the Google service account&apos;s JSON key) to connect Search Console.</p>
      ) : (
        <div className="flex flex-col gap-1 text-[13px] text-slate">
          <span>The client adds this email in Search Console → Settings → Users and permissions (Restricted is enough). Onboarding shows them how.</span>
          <span className="inline-flex items-center gap-2 self-start rounded-badge border border-line bg-sidebar py-0.5 pl-2.5 pr-1 font-mono text-[13px] text-ink">{email}<CopyButton text={email} /></span>
        </div>
      )}
      {error && <p className="text-[13px] text-danger-text">{error}</p>}
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[240px] flex-1 flex-col gap-1.5 text-[13px] font-medium">Property
          {sites && sites.length > 0 ? (
            <select value={value} onChange={(e) => setValue(e.target.value)} className="h-10 rounded-control border border-field bg-white px-3 text-[14px]">
              <option value="">Pick a property</option>{sites.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="sc-domain:asanja.com" className="font-mono text-[13px]" />
          )}
        </label>
        {email && !sites && <Button variant="secondary" className="h-10" disabled={pending} onClick={load}>Find shared properties</Button>}
        <Button className="h-10" disabled={pending || value === (site ?? "")} onClick={() => run(() => setSearchConsoleSite(clientId, value))}>{pending ? "Working…" : value ? "Connect and sync" : "Disconnect"}</Button>
        {site && <Button variant="secondary" className="h-10" disabled={pending} onClick={() => run(() => syncSeoNow(clientId))}>Sync now</Button>}
      </div>
      <Note m={msg} />
    </Box>
  );
}

export function KeywordsCard({ clientId, keywords }: { clientId: string; keywords: SeoKeyword[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const add = () => start(async () => {
    setMsg(null);
    const r = await addSeoKeywords(clientId, text);
    if (r.ok) { setText(""); setMsg({ ok: true, text: r.message ?? "Added." }); } else setMsg({ ok: false, text: r.error });
    router.refresh();
  });
  return (
    <Box title="Tracked keywords" note="The searches we're working on. The client sees each one's Google position.">
      {keywords.length > 0 && (
        <ul className="flex flex-col border-t border-line-soft">
          {keywords.map((k) => (
            <li key={k.id} className="flex items-center gap-3 border-b border-line-soft py-2">
              <span className="min-w-0 flex-1 truncate text-[14px]">{k.keyword}</span>
              <span className="text-[13px] tabular-nums text-slate">{k.position !== null ? `Pos. ${k.position.toFixed(1)}` : k.checked_at ? "Not in top 100" : "Not checked yet"}</span>
              <button type="button" disabled={pending} onClick={() => start(async () => { await removeSeoKeyword(clientId, k.id); router.refresh(); })}
                className="h-8 rounded-control px-2 text-[13px] font-medium text-danger-text hover:bg-[#FBEAEA]" aria-label={`Stop tracking ${k.keyword}`}>Remove</button>
            </li>
          ))}
        </ul>
      )}
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">Add searches, one per line
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={"serengeti safari\nkilimanjaro machame route\nzanzibar beach holiday"} />
      </label>
      <div className="flex items-center gap-3"><Button className="h-9" disabled={pending || !text.trim()} onClick={add}>Add keywords</Button><Note m={msg} /></div>
    </Box>
  );
}

export function WorkCard({ clientId, work, thisMonth }: { clientId: string; work: SeoWork[]; thisMonth: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const find = (m: string) => work.find((w) => w.month.slice(0, 7) === m)?.body ?? "";
  const [month, setMonth] = useState(thisMonth);
  const [body, setBody] = useState(find(thisMonth));
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <Box title="What we did (monthly)" note="Write what you did this month in plain words. The client sees it on their SEO tab.">
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">Month
          <Input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setBody(find(e.target.value)); setMsg(null); }} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium">Work done
          <Textarea rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder={"• Rewrote titles and descriptions on 6 tour pages\n• Fixed 14 broken links\n• New blog post: Best time to see the Great Migration"} />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button className="h-9" disabled={pending} onClick={() => start(async () => { const r = await saveSeoWork(clientId, month, body); setMsg(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error }); router.refresh(); })}>Save</Button>
        <Note m={msg} />
      </div>
    </Box>
  );
}
