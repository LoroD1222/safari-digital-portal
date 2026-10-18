"use client";
import { useState, useTransition } from "react";
import { Alert, Button, Textarea } from "@/components/ui";
import { Icon } from "@/components/icons";
import { reviewContent, type ReviewState } from "../actions";

export function ReviewPanel({ id }: { id: string }) {
  const [mode, setMode] = useState<"choose" | "changes">("choose");
  const [comment, setComment] = useState("");
  const [state, setState] = useState<ReviewState>({});
  const [pending, start] = useTransition();
  const go = (approve: boolean) => start(async () => setState(await reviewContent(id, approve, comment)));

  if (state.done) {
    return <Alert tone="success">{state.done === "approved" ? "Approved. Thank you! We'll schedule it." : "Thanks, we've got your feedback and will send a new version."}</Alert>;
  }
  return (
    <div className="flex flex-col gap-3 rounded-card border border-[#F1D9A8] bg-[#FFFAF0] px-4 py-4">
      <p className="font-semibold">This needs your approval</p>
      {mode === "choose" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => go(true)} disabled={pending}><Icon name="check" size={16} />{pending ? "Saving…" : "Approve"}</Button>
          <Button type="button" variant="secondary" onClick={() => setMode("changes")} disabled={pending}>Request changes</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor="changes" className="font-medium">What would you like changed?</label>
          <Textarea id="changes" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} autoFocus
            placeholder="e.g. Use the lion clip at the start and mention our December offer." />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => go(false)} disabled={pending || !comment.trim()}>{pending ? "Sending…" : "Send feedback"}</Button>
            <Button type="button" variant="ghost" onClick={() => setMode("choose")} disabled={pending}>Cancel</Button>
          </div>
        </div>
      )}
      {state.error && <Alert>{state.error}</Alert>}
    </div>
  );
}
