"use client";
import { useActionState } from "react";
import { Alert, Select } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { setVercelProject, type DataState } from "./data-actions";

export function VercelProjectPicker({ clientId, current, projects }: { clientId: string; current: string | null; projects: { id: string; name: string }[] }) {
  const [state, action] = useActionState<DataState, FormData>(setVercelProject.bind(null, clientId), {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <label htmlFor="vercel_project_id" className="text-[13px] font-medium">Website project</label>
          <Select id="vercel_project_id" name="vercel_project_id" defaultValue={current ?? ""}>
            <option value="">Not connected</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
        <SubmitButton variant="secondary">Save</SubmitButton>
      </div>
      {state.error && <Alert>{state.error}</Alert>}
      {state.saved && <Alert tone="success">Saved. The client&apos;s Website page now uses this project.</Alert>}
    </form>
  );
}
