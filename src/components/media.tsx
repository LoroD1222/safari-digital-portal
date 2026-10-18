import { Icon } from "./icons";

// Shows a content item's image or video, or a calm placeholder.
export function Media({ url, type, alt, controls, className }: { url: string | null; type: string | null; alt: string; controls?: boolean; className?: string }) {
  const cls = "h-full w-full object-cover " + (className ?? "");
  if (!url) {
    return <div className="flex h-full w-full items-center justify-center bg-sidebar text-slate"><Icon name="film" size={28} /></div>;
  }
  if (type?.startsWith("video/")) {
    return controls
      ? <video src={url} controls playsInline preload="metadata" className={"h-full w-full bg-black object-contain " + (className ?? "")} aria-label={alt} />
      : <video src={`${url}#t=0.5`} muted playsInline preload="metadata" className={cls} aria-label={alt} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={controls ? "h-full w-full bg-sidebar object-contain " + (className ?? "") : cls} loading="lazy" />;
}
