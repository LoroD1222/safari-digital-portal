"use client";
import { useRef, useState, useTransition } from "react";
import { unzipSync } from "fflate";
import { Alert, Button, Input, Select } from "@/components/ui";
import { Icon } from "@/components/icons";
import { FIELDS, buildImport, guessMapping, parseCsv, prettyPhone, readXlsxSheet, type CallList, type Field } from "@/lib/calls";
import { importList } from "./actions";

type Parsed = { file: string; header: string[]; rows: string[][] };

async function readFile(f: File): Promise<string[][]> {
  const name = f.name.toLowerCase();
  if (name.endsWith(".xls")) throw new Error("That's an old Excel file (.xls). In Excel, choose File › Save As › .xlsx or CSV, then upload that.");
  if (name.endsWith(".xlsx")) {
    const files = unzipSync(new Uint8Array(await f.arrayBuffer()));
    const dec = new TextDecoder();
    const sheets = Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    if (!sheets.length) throw new Error("We couldn't find a sheet in that Excel file.");
    const shared = files["xl/sharedStrings.xml"];
    return readXlsxSheet(dec.decode(files[sheets[0]]), shared ? dec.decode(shared) : null);
  }
  return parseCsv(await f.text());
}

export function ImportDialog({ lists, onClose, onDone }: { lists: CallList[]; onClose: () => void; onDone: (message: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Field[]>([]);
  const [target, setTarget] = useState<string>("new");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [saving, start] = useTransition();

  const load = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    if (f.size > 10 * 1024 * 1024) { setError("That file is over 10 MB. Split it into smaller lists."); return; }
    try {
      const all = await readFile(f);
      if (all.length < 2) { setError("The file needs a header row and at least one row of numbers."); return; }
      const [header, ...rows] = all;
      const m = guessMapping(header, rows.slice(0, 20));
      setParsed({ file: f.name, header, rows: rows.slice(0, 5000) });
      setMapping(m);
      setName(f.name.replace(/\.(csv|xlsx|txt)$/i, "").replace(/[-_]+/g, " ").trim().slice(0, 120));
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn't read that file.");
    }
  };

  const built = parsed ? buildImport(parsed.rows, mapping, new Set()) : null;
  const hasPhone = mapping.includes("phone");
  const setField = (i: number, f: Field) => setMapping((m) => m.map((x, j) => (j === i ? f : f !== "skip" && x === f ? "skip" : x)));

  const save = () => start(async () => {
    if (!built) return;
    setError(null);
    // In batches, so a big list stays under the upload size limit.
    let listId = target === "new" ? null : target, added = 0, skipped = 0;
    for (let i = 0; i < built.rows.length; i += 1000) {
      const r = await importList({ listId, newName: name, rows: built.rows.slice(i, i + 1000) });
      if (!r.ok) { setError(added ? `${added} numbers were imported, then: ${r.error}` : r.error); return; }
      listId = r.listId; added += r.added; skipped += r.skipped;
    }
    onDone(`${added} ${added === 1 ? "number" : "numbers"} added${skipped ? `, ${skipped} skipped because they're already in a list, already a lead, or on Do not call` : ""}.`);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(0,3,33,0.35)] px-4 py-12" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="import-title" onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[680px] flex-col gap-4 rounded-[14px] bg-white p-[22px] shadow-[0_20px_50px_rgba(0,3,33,0.2)]">
        <div className="flex items-center justify-between">
          <h2 id="import-title" className="text-lg font-semibold">{parsed ? "Check the columns" : "Upload a call list"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex size-8 items-center justify-center rounded-control hover:bg-[#F1F2F4]"><Icon name="close" size={16} /></button>
        </div>

        {!parsed && (
          <>
            <button type="button" onClick={() => input.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); void load(e.dataTransfer.files[0]); }}
              className={`flex flex-col items-center gap-1.5 rounded-card border-[1.5px] border-dashed px-4 py-9 ${drag ? "border-brand bg-[#EEF7F1]" : "border-[#C9CDD6] bg-sidebar"}`}>
              <Icon name="upload" size={26} className="text-brand" />
              <span className="font-semibold">Drop a CSV or Excel file, or click to choose</span>
              <span className="text-xs text-slate">Google Sheets: File › Download › CSV or .xlsx. One row per company, names in the first row.</span>
            </button>
            <input ref={input} type="file" accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => void load(e.target.files?.[0])} />
            <p className="text-xs text-slate">Only a phone number is required; company, contact, email, website, address, city and country are picked up too. Without a country column, it&apos;s worked out from the number (+255 → Tanzania). Numbers like 0754 123 456 are saved as +255 754 123 456 so Call and WhatsApp work. Numbers already in a list, already a lead, or on Do not call are skipped.</p>
          </>
        )}

        {parsed && built && (
          <>
            <p className="text-[13px] text-body"><strong className="font-semibold">{parsed.file}</strong> · {parsed.rows.length} rows. Tell us what each column is:</p>
            <div className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto pr-1">
              {parsed.header.map((h, i) => (
                <div key={i} className="grid grid-cols-[1fr_20px_1fr] items-center gap-2 text-[13px]">
                  <span className="truncate rounded-control bg-sidebar px-2.5 py-2 font-mono text-xs" title={h}>{h || `Column ${i + 1}`}<span className="ml-2 font-sans text-slate">{parsed.rows[0]?.[i] ?? ""}</span></span>
                  <span aria-hidden="true" className="text-center text-slate">→</span>
                  <Select aria-label={`Column ${h || i + 1}`} value={mapping[i] ?? "skip"} onChange={(e) => setField(i, e.target.value as Field)} className="h-9">
                    {FIELDS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  </Select>
                </div>
              ))}
            </div>

            {built.rows.length > 0 && (
              <div className="overflow-x-auto rounded-control border border-line">
                <table className="w-full text-[12px]">
                  <thead><tr className="border-b border-line text-left text-slate"><th className="px-2.5 py-1.5 font-medium">Company</th><th className="px-2.5 py-1.5 font-medium">Contact</th><th className="px-2.5 py-1.5 font-medium">Phone</th><th className="px-2.5 py-1.5 font-medium">City</th><th className="px-2.5 py-1.5 font-medium">Country</th></tr></thead>
                  <tbody>{built.rows.slice(0, 4).map((r) => <tr key={r.phone} className="border-b border-[#F1F2F4] last:border-0"><td className="px-2.5 py-1.5">{r.company ?? "—"}</td><td className="px-2.5 py-1.5">{r.contact_name ?? "—"}</td><td className="px-2.5 py-1.5 tabular-nums">{prettyPhone(r.phone)}</td><td className="px-2.5 py-1.5">{r.city ?? "—"}</td><td className="px-2.5 py-1.5">{r.country ?? "—"}</td></tr>)}</tbody>
                </table>
              </div>
            )}

            <div className="grid gap-2.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[13px] font-medium">Add to
                <Select value={target} onChange={(e) => setTarget(e.target.value)}>
                  <option value="new">A new list</option>
                  {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </label>
              {target === "new" && <label className="flex flex-col gap-1 text-[13px] font-medium">List name<Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Arusha tour operators" /></label>}
            </div>

            <div className="flex flex-col gap-1 rounded-control bg-[#FDF6EC] px-3 py-2.5 text-[13px] text-[#6B3E0E]">
              {!hasPhone ? <span>Pick which column has the phone number.</span> : <span>{built.rows.length} numbers ready to import.</span>}
              {built.noPhone > 0 && hasPhone && <span>{built.noPhone === 1 ? "1 row has" : `${built.noPhone} rows have`} no usable phone number and {built.noPhone === 1 ? "is" : "are"} left out.</span>}
              {built.duplicate > 0 && <span>{built.duplicate === 1 ? "1 number appears" : `${built.duplicate} numbers appear`} more than once in the file; each is imported once.</span>}
              <span>Numbers already in a list, already a lead, or on Do not call are skipped when you import.</span>
            </div>

            {error && <Alert>{error}</Alert>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setParsed(null); setError(null); }}>Choose another file</Button>
              <Button disabled={saving || !hasPhone || !built.rows.length || (target === "new" && !name.trim())} onClick={save}>{saving ? "Importing…" : `Import ${built.rows.length} numbers`}</Button>
            </div>
          </>
        )}
        {!parsed && error && <Alert>{error}</Alert>}
      </div>
    </div>
  );
}
