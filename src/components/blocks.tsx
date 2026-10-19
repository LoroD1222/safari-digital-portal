import Link from "next/link";
import type { ReactNode } from "react";
import { ago } from "@/lib/dates";

function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

// Link tabs (each tab is its own URL, so they work without JavaScript).
export function Tabs({ items, label }: { items: { href: string; label: string; active: boolean; count?: number }[]; label: string }) {
  return (
    <nav aria-label={label} className="-mt-2 flex gap-5 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? "page" : undefined} scroll={false}
          className={cx("-mb-px flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 text-sm font-medium no-underline",
            t.active ? "border-brand text-ink" : "border-transparent text-slate hover:text-ink")}>
          {t.label}
          {!!t.count && <span className="rounded-full bg-[#FDF3E1] px-1.5 text-[11px] font-semibold text-[#8A5A12]">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

// Small pill filters (All / Needs approval / …).
export function Filters({ items, label }: { items: { href: string; label: string; active: boolean; count?: number }[]; label: string }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((f) => (
        <Link key={f.href} href={f.href} aria-current={f.active ? "true" : undefined} scroll={false}
          className={cx("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium no-underline",
            f.active ? "border-forest bg-forest text-white" : "border-field bg-white text-body hover:bg-[#F4F5F2]")}>
          {f.label}
          {f.count !== undefined && <span className={f.active ? "text-white/70" : "text-slate"}>{f.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Section({ title, action, children, id }: { title: string; action?: ReactNode; children: ReactNode; id?: string }) {
  const hid = id ?? title.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <section aria-labelledby={hid} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={hid} className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// A bordered list of rows. Each row can be a link.
export function RowList({ children }: { children: ReactNode }) {
  return <ul className="overflow-hidden rounded-card border border-line [&>li+li]:border-t [&>li+li]:border-line-soft">{children}</ul>;
}

export function Row({ href, children, className }: { href?: string; children: ReactNode; className?: string }) {
  const cls = cx("flex flex-wrap items-center gap-x-3.5 gap-y-1.5 px-4 py-3", className);
  return <li>{href ? <Link href={href} className={cx(cls, "text-ink no-underline hover:bg-[#FAFAF8]")}>{children}</Link> : <div className={cls}>{children}</div>}</li>;
}

export type AttentionItem = { key: string; title: string; detail?: string; href: string; tone?: "amber" | "red" | "blue"; action?: string };
const DOT = { amber: "bg-[#E0A458]", red: "bg-[#C2413B]", blue: "bg-[#5B7BE0]" };

export function AttentionList({ items, empty, emptyNote }: { items: AttentionItem[]; empty: string; emptyNote?: string }) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-card border border-line px-5 py-7 text-center">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-[#E3F4EA] text-brand">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
        <span className="font-semibold">{empty}</span>
        {emptyNote && <span className="text-[13px] text-slate">{emptyNote}</span>}
      </div>
    );
  }
  return (
    <RowList>
      {items.map((it) => (
        <Row key={it.key} href={it.href}>
          <span className={cx("size-2 flex-none rounded-full", DOT[it.tone ?? "amber"])} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">{it.title}</span>
            {it.detail && <span className="truncate text-xs text-slate">{it.detail}</span>}
          </span>
          {it.action
            ? <span className="inline-flex h-8 items-center whitespace-nowrap rounded-control border border-field px-3 text-[13px] font-medium">{it.action}</span>
            : <span aria-hidden="true" className="text-slate">›</span>}
        </Row>
      ))}
    </RowList>
  );
}

export type ActivityEntry = { id: string; message: string; created_at: string; href?: string | null; who?: string };

export function ActivityList({ items, empty }: { items: ActivityEntry[]; empty: string }) {
  if (!items.length) return <p className="text-[13px] text-slate">{empty}</p>;
  return (
    <ol className="flex flex-col">
      {items.map((a) => {
        const body = (
          <>
            <span className="mt-[7px] size-[7px] flex-none rounded-full bg-mint" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span>{a.who && <span className="font-medium">{a.who} · </span>}{a.message}</span>
              <span className="text-xs text-slate">{ago(a.created_at)}</span>
            </span>
          </>
        );
        return (
          <li key={a.id}>
            {a.href
              ? <Link href={a.href} className="flex gap-3 py-[7px] text-ink no-underline hover:text-brand">{body}</Link>
              : <div className="flex gap-3 py-[7px]">{body}</div>}
          </li>
        );
      })}
    </ol>
  );
}

export function Progress({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[13px]">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-slate">{done} of {total} published</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line-soft" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="w-fit text-[13px] font-medium text-brand no-underline">← {children}</Link>;
}

// Label + value pairs.
export function DetailList({ rows }: { rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  return (
    <dl className="flex flex-col">
      {shown.map(([k, v]) => (
        <div key={k} className="flex flex-wrap gap-x-4 gap-y-0.5 border-t border-line-soft py-2.5 first:border-t-0">
          <dt className="w-40 flex-none text-slate">{k}</dt>
          <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
