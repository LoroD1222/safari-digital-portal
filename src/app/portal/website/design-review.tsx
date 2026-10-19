"use client";
import { useState, useTransition } from "react";
import { Alert, Button, Textarea, buttonClass } from "@/components/ui";
import { Icon } from "@/components/icons";
import { reviewDesign } from "./actions";

// Shown inside the "Your approval" step when Safari Digital has sent a design.
export function DesignReview({ previewUrl }: { previewUrl: string }) {
  const [mode, setMode] = useState<"choose" | "changes">("choose");
  const [text, setText] = useState("");
  const [res, setRes] = useState<{ error?: string; ok?: boolean; approved?: boolean }>({});
  const [pending, start] = useTransition();
  const go = (approve: boolean) => start(async () => setRes({ ...(await reviewDesign(approve, text)), approved: approve }));

  if (res.ok) {
    return <Alert tone="success">{res.approved ? "Thank you! Design approved, so we'll start building your website." : "Thanks! We'll update the design and ask you to look again."}</Alert>;
  }
  return (
    <div className="flex flex-col gap-4 rounded-card border border-[#F1D9A8] bg-[#FFFAF0] p-4">
      <ol className="flex flex-col gap-2 text-[13px] text-body">
        <li className="flex gap-2"><span className="font-semibold text-ink">1.</span>Open the design and look through every page, on your phone too.</li>
        <li className="flex gap-2"><span className="font-semibold text-ink">2.</span>Approve it, or tell us what you&apos;d like changed. You can ask for changes as often as you need.</li>
      </ol>
      <a href={previewUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary", "w-fit bg-white")}>
        <Icon name="eye" size={16} />Open the design<Icon name="external" size={14} />
      </a>
      {mode === "choose" ? (
        <div className="flex flex-wrap gap-2 border-t border-[#F1D9A8] pt-4">
          <Button type="button" onClick={() => go(true)} disabled={pending}><Icon name="check" size={16} />{pending ? "Saving…" : "Approve design"}</Button>
          <Button type="button" variant="secondary" className="bg-white" onClick={() => setMode("changes")} disabled={pending}><Icon name="edit" size={15} />Request changes</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 border-t border-[#F1D9A8] pt-4">
          <label htmlFor="design-fb" className="font-medium">What would you like changed?</label>
          <Textarea id="design-fb" rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus
            placeholder={"e.g. Use the photo of the lodge on the home page.\nMake the WhatsApp button bigger."} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => go(false)} disabled={pending || !text.trim()}>{pending ? "Sending…" : "Send feedback"}</Button>
            <Button type="button" variant="ghost" onClick={() => setMode("choose")} disabled={pending}>Cancel</Button>
          </div>
        </div>
      )}
      {res.error && <Alert>{res.error}</Alert>}
    </div>
  );
}
