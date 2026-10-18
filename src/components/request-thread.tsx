import type { SupabaseClient } from "@supabase/supabase-js";
import type { RequestMessage } from "@/lib/types";
import { fmtDateTime } from "@/lib/dates";
import { Icon } from "./icons";

export async function loadThread(supabase: SupabaseClient, requestId: string) {
  const { data } = await supabase.from("request_messages").select("*").eq("request_id", requestId).order("created_at");
  const msgs = (data ?? []) as RequestMessage[];
  const paths = msgs.map((m) => m.attachment_path).filter(Boolean) as string[];
  const { data: signed } = paths.length ? await supabase.storage.from("request-files").createSignedUrls(paths, 3600) : { data: [] };
  const urls: Record<string, string> = {};
  paths.forEach((p, i) => { const u = signed?.[i]?.signedUrl; if (u) urls[p] = u; });
  return { msgs, urls };
}

export function Thread({ msgs, urls, me, clientName }: { msgs: RequestMessage[]; urls: Record<string, string>; me: "admin" | "client"; clientName: string }) {
  return (
    <ol className="flex flex-col gap-3">
      {msgs.map((m) => {
        const mine = m.author_role === me;
        return (
          <li key={m.id} className={"flex " + (mine ? "justify-end" : "justify-start")}>
            <div className={"flex max-w-[85%] flex-col gap-1 rounded-card px-4 py-3 " + (mine ? "bg-[#EEF7F2]" : "border border-line bg-white")}>
              <span className="text-xs text-slate">
                <span className="font-medium text-ink">{m.author_role === "admin" ? "Safari Digital" : clientName}</span> · {fmtDateTime(m.created_at)}
              </span>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              {m.attachment_path && (
                urls[m.attachment_path]
                  ? <a href={urls[m.attachment_path]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand"><Icon name="paperclip" size={14} />{m.attachment_name ?? "Attachment"}</a>
                  : <span className="text-[13px] text-slate">{m.attachment_name}</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
