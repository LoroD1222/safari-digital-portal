"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Input, Select, Textarea } from "@/components/ui";
import { Icon } from "@/components/icons";
import { DEFAULT_SCRIPT, STATUS_LABEL, listStats, pct, prettyPhone, type CallContact, type CallList, type CallLog, type CallStatus } from "@/lib/calls";
import { archiveList, deleteList, reopenNumber, saveList } from "./actions";
import { ContactForm } from "./contact-form";

export function ListsTab({ lists, contacts, logs, onToast, onImport }: {
  lists: CallList[]; contacts: CallContact[]; logs: CallLog[]; onToast: (m: string) => void; onImport: () => void;
}) {
  const stats = listStats(lists, contacts, logs);
  if (!lists.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-field px-5 py-12 text-center">
        <span className="text-[15px] font-semibold">No lists yet</span>
        <Button className="mt-2" onClick={onImport}><Icon name="upload" size={16} />Upload list</Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {lists.map((l) => <ListCard key={l.id} list={l} stat={stats.find((s) => s.id === l.id)!} contacts={contacts.filter((c) => c.list_id === l.id)} onToast={onToast} />)}
    </div>
  );
}

function ListCard({ list, stat, contacts, onToast }: { list: CallList; stat: ReturnType<typeof listStats>[number]; contacts: CallContact[]; onToast: (m: string) => void }) {
  const router = useRouter();
  const [name, setName] = useState(list.name);
  const [script, setScript] = useState(list.script ?? "");
  const [editing, setEditing] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [filter, setFilter] = useState<CallStatus | "all">("all");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [edit, setEdit] = useState<string | null>(null); // a number's id, or "new"
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, after?: () => void) => start(async () => {
    setError(null);
    const r = await fn();
    if (!r.ok) { setError(r.error); return; }
    if (r.message) onToast(r.message);
    after?.();
    router.refresh();
  });
  const progress = stat.total ? stat.called / stat.total : 0;
  const shown = contacts.filter((c) => filter === "all" || c.status === filter);
  const present = [...new Set(contacts.map((c) => c.status))];

  return (
    <section aria-label={list.name} className={`flex flex-col gap-4 rounded-card border border-line p-5 ${list.archived ? "bg-sidebar" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[16px] font-semibold">{list.name}{list.archived && <span className="ml-2 text-[13px] font-normal text-slate">Archived</span>}</h2>
          <span className="text-[13px] text-slate">{stat.total} numbers · {stat.open} still to call</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="h-9" onClick={() => setEditing((v) => !v)}>{editing ? "Close" : "Name & script"}</Button>
          <Button variant="secondary" className="h-9" disabled={pending} onClick={() => run(() => archiveList(list.id, !list.archived))}>{list.archived ? "Restore" : "Archive"}</Button>
          {confirmDelete
            ? <Button className="h-9 bg-[#C2413B] hover:bg-[#9C2F2B]" disabled={pending} onClick={() => run(() => deleteList(list.id))}>Delete {stat.total} numbers and their call history</Button>
            : <Button variant="ghost" className="h-9" onClick={() => setConfirmDelete(true)}>Delete</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
          <span className="text-xs text-slate">Called</span>
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EEF0F2]"><div className="h-full bg-brand" style={{ width: pct(progress) }} /></div>
            <span className="text-[13px] tabular-nums">{stat.called}/{stat.total}</span>
          </div>
        </div>
        <Num label="Pick-up rate" value={stat.calls ? pct(stat.rate) : "—"} note={`${stat.calls} calls, last 4 weeks`} />
        <Num label="Interested" value={String(stat.interested)} note="last 4 weeks" />
        <Num label="Reached" value={String(stat.reached)} note="picked up and talked" />
      </div>

      {editing && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <label className="flex flex-col gap-1 text-[13px] font-medium">List name<Input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-[13px] font-medium">Call script for this list
            <Textarea rows={12} value={script} onChange={(e) => setScript(e.target.value)} placeholder={DEFAULT_SCRIPT} className="font-mono text-[13px]" />
            <span className="text-xs font-normal text-slate">Leave a blank line between steps; the first line of each step is its title. Tags: {"{{first_name}} {{company}} {{city}} {{country}} {{agent_name}} {{our_company}}"}. Leave it empty to use the main script from Settings.</span>
          </label>
          <div className="flex gap-2">
            <Button disabled={pending} onClick={() => run(() => saveList(list.id, { name, script }), () => setEditing(false))}>Save</Button>
            {!script && <Button variant="secondary" onClick={() => setScript(DEFAULT_SCRIPT)}>Start from the standard script</Button>}
          </div>
        </div>
      )}

      {error && <Alert>{error}</Alert>}

      <div className="border-t border-line pt-3">
        <div className="flex flex-wrap gap-4">
          <button type="button" onClick={() => setShowNumbers((v) => !v)} className="text-[13px] font-medium text-brand">{showNumbers ? "Hide numbers" : `Show the ${stat.total} numbers`}</button>
          {!list.archived && <button type="button" onClick={() => setEdit("new")} className="text-[13px] font-medium text-brand">+ Add a number</button>}
        </div>
        {edit === "new" && <div className="mt-3"><ContactForm listId={list.id} onCancel={() => setEdit(null)} onDone={(m) => { setEdit(null); onToast(m); router.refresh(); }} /></div>}
        {showNumbers && (
          <div className="mt-3 flex flex-col gap-2">
            <Select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value as CallStatus | "all")} className="h-9 w-auto self-start">
              <option value="all">All ({contacts.length})</option>
              {present.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]} ({contacts.filter((c) => c.status === s).length})</option>)}
            </Select>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-line text-left text-slate"><th className="px-2 py-1.5 font-medium">Company</th><th className="px-2 py-1.5 font-medium">Phone</th><th className="px-2 py-1.5 font-medium">Website</th><th className="px-2 py-1.5 font-medium">Address</th><th className="px-2 py-1.5 font-medium">Country</th><th className="px-2 py-1.5 font-medium">Status</th><th className="px-2 py-1.5 font-medium">Tries</th><th /></tr></thead>
                <tbody>
                  {shown.slice(0, 300).map((c) => edit === c.id ? (
                    <tr key={c.id}><td colSpan={8} className="py-2">
                      <ContactForm contact={c} onCancel={() => setEdit(null)} onDone={(m) => { setEdit(null); onToast(m); router.refresh(); }} />
                    </td></tr>
                  ) : (
                    <tr key={c.id} className="border-b border-[#F1F2F4]">
                      <td className="px-2 py-1.5">{c.company ?? c.contact_name ?? "—"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{prettyPhone(c.phone)}</td>
                      <td className="max-w-[180px] truncate px-2 py-1.5">{c.website?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? "—"}</td>
                      <td className="max-w-[200px] truncate px-2 py-1.5">{[c.address, c.city].filter(Boolean).join(", ") || "—"}</td>
                      <td className="px-2 py-1.5">{c.country ?? "—"}</td>
                      <td className="px-2 py-1.5">{STATUS_LABEL[c.status]}</td>
                      <td className="px-2 py-1.5 tabular-nums">{c.attempts}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right">
                        <button type="button" onClick={() => setEdit(c.id)} className="mr-3 text-[13px] font-medium text-slate hover:text-ink">Edit</button>
                        {["not_interested", "unreachable", "wrong_number"].includes(c.status) && (
                          <button type="button" disabled={pending} onClick={() => run(() => reopenNumber(c.id))} className="text-[13px] font-medium text-brand">Call again</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length > 300 && <p className="px-2 py-2 text-xs text-slate">Showing the first 300.</p>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Num({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-slate">{label}</span>
      <span className="text-[20px] font-semibold tabular-nums">{value}</span>
      <span className="text-[11px] text-slate">{note}</span>
    </div>
  );
}
