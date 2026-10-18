import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

const BTN = {
  primary: "bg-brand text-white font-semibold hover:bg-brand-hover",
  secondary: "border border-field bg-white text-ink font-medium hover:bg-[#F4F5F2]",
  ghost: "text-slate font-medium hover:text-ink",
};

export function buttonClass(variant: keyof typeof BTN = "primary", extra?: string) {
  return cx(
    "inline-flex h-10 items-center justify-center gap-1.5 rounded-control px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    BTN[variant],
    extra,
  );
}

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: keyof typeof BTN }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: keyof typeof BTN }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

const INPUT = "h-10 w-full rounded-control border border-field bg-white px-3 text-sm text-ink placeholder:text-[#8A8FA3] focus:outline-2 focus:outline-mint aria-invalid:border-danger";

export function Field({ label, hint, error, children, htmlFor, optional }: {
  label: string; hint?: string; error?: string; children: ReactNode; htmlFor: string; optional?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="font-medium">
        {label}
        {optional && <span className="font-normal text-slate"> · optional</span>}
      </label>
      {children}
      {error ? <span className="text-xs text-danger-text">{error}</span> : hint ? <span className="text-xs text-slate">{hint}</span> : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(INPUT, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(INPUT, "px-2.5", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(INPUT, "h-auto py-2.5", className)} {...props} />;
}

const TONES = {
  neutral: ["#F1F2F4", "#4A4F63", "#8A8FA3"],
  amber: ["#FDF3E1", "#8A5A12", "#E0A458"],
  red: ["#FBEAEA", "#9C2F2B", "#C2413B"],
  green: ["#E3F4EA", "#1A6647", "#1A6647"],
  blue: ["#E8EEFB", "#3450A6", "#5B7BE0"],
  forest: ["#E8F6EF", "#0D3B2E", "#0D3B2E"],
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const [bg, fg, dot] = TONES[tone];
  return (
    <span className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-badge px-2 text-xs font-medium" style={{ background: bg, color: fg }}>
      <span className="size-1.5 rounded-full" style={{ background: dot }} />
      {children}
    </span>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-card border border-line bg-white shadow-[0_1px_2px_rgba(0,3,33,0.04)]", className)} {...props} />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
        {subtitle && <p className="text-slate">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, note, href }: { label: string; value: ReactNode; note?: string; href?: string }) {
  const body = (
    <>
      <span className="text-[13px] text-slate">{label}</span>
      <span className="text-[28px] font-semibold leading-tight tracking-[-0.03em] tabular-nums">{value}</span>
      {note && <span className="text-xs text-slate">{note}</span>}
    </>
  );
  const cls = "flex flex-col gap-1 rounded-card border border-line px-[18px] py-4";
  return href ? <Link href={href} className={cx(cls, "text-ink no-underline hover:bg-[#FAFAF8]")}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-field px-5 py-10 text-center">
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="max-w-sm text-slate">{body}</span>
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

export function Alert({ tone = "error", children }: { tone?: "error" | "success" | "info"; children: ReactNode }) {
  const s = tone === "error" ? "border-[#F2C9C6] bg-[#FDF4F3] text-[#7A2724]" : tone === "success" ? "border-[#BFE3CF] bg-[#F1FAF6] text-forest" : "border-line bg-sidebar text-body";
  return <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-control border px-3.5 py-2.5 text-[13px]", s)}>{children}</div>;
}
