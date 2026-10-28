"use client";
import { useState, useTransition } from "react";
import { Alert, Button, Select } from "@/components/ui";
import { previewReport, sendReportsNow, type ReportState } from "./actions";

export function MonthlyReports({ clients, month }: { clients: { id: string; name: string }[]; month: string }) {
  const [client, setClient] = useState(clients[0]?.id ?? "");
  const [state, setState] = useState<ReportState>({});
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-60 max-w-full">
          <Select aria-label="Client" value={client} onChange={(e) => setClient(e.target.value)} className="h-9">
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <Button variant="secondary" className="h-9" disabled={pending || !client} onClick={() => start(async () => setState(await previewReport(client)))}>Send me a preview</Button>
        <Button variant="secondary" className="h-9" disabled={pending}
          onClick={() => { if (confirm(`Send the ${month} report to every client who hasn't received it yet?`)) start(async () => setState(await sendReportsNow())); }}>
          {pending ? "Working…" : `Send ${month} reports now`}
        </Button>
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      {state.message && (
        <Alert tone="success">
          {state.message}
          {state.lines && <ul className="mt-1 list-disc pl-5">{state.lines.map((l) => <li key={l}>{l}</li>)}</ul>}
        </Alert>
      )}
    </div>
  );
}
