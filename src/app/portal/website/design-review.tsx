"use client";
import { useState, useTransition } from "react";
import { Alert, Button, Textarea, buttonClass } from "@/components/ui";
import { Icon } from "@/components/icons";
import { reviewDesign } from "./actions";

export function DesignReview({ previewUrl }: { previewUrl: string }) {
  const [mode, setMode] = useState<"choose" | "changes">("choose");
  const [text, setText] = useState("");
  const [res, setRes] = useState<{ error?: string; ok?: boolean; approved?: boolean }>({});
  const [pending, start] = useTransition();
  const go = (approve: boolean) => start(async () => setRes({ ...(await reviewDesign(approve, text)), approved: approve }));

  if (res.ok) return <Alert tone="success">{res.approved ? "Thank you! We'll start building your website." : "Thanks, we'll update the design and let you know."}</Alert>;
  return (
    <div className="flex flex-col gap-3 rounded-card border border-[#F1D9A8] bg-[#FFFAF0] px-4 py-4">
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold">Your website design is ready</span>
        <span className="text-[13px] text-body">Have a look, then approve it or tell us what to change.</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={previewUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>Review design<Icon name="external" size={15} /></a>
        {mode === "choose" && <>
          <Button type="button" onClick={() => go(true)} disabled={pending}><Icon name="check" size={16} />Approve design</Button>
          <Button type="button" variant="ghost" onClick={() => setMode("changes")}>Request changes</Button>
        </>}
      </div>
      {mode === "changes" && (
        <div className="flex flex-col gap-2">
          <label htmlFor="design-fb" className="font-medium">What would you like changed?</label>
          <Textarea id="design-fb" rows={3} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
          <div className="flex gap-2">
            <Button type="button" onClick={() => go(false)} disabled={pending || !text.trim()}>{pending ? "Sending…" : "Send feedback"}</Button>
            <Button type="button" variant="ghost" onClick={() => setMode("choose")}>Cancel</Button>
          </div>
        </div>
      )}
      {res.error && <Alert>{res.error}</Alert>}
    </div>
  );
}
