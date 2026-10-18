"use client";
import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1800); } catch { /* ignore */ } }}
      className="inline-flex h-8 items-center rounded-control border border-field bg-white px-3 text-[13px] font-medium hover:bg-[#F4F5F2]">
      {done ? "Copied" : label}
    </button>
  );
}
