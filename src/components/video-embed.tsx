// Plays a video from a link: YouTube, Vimeo, Loom, Google Drive, or a direct .mp4/.webm file.

type Embed = { kind: "iframe" | "file"; src: string };

export function toEmbed(raw?: string | null): Embed | null {
  const url = raw?.trim();
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\./, "");

  if (host === "youtu.be") return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}` };
  if (host.endsWith("youtube.com")) {
    const id = u.searchParams.get("v") ?? u.pathname.match(/\/(?:shorts|embed|live)\/([\w-]+)/)?.[1];
    if (id) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (host === "vimeo.com") {
    const id = u.pathname.match(/\/(\d+)/)?.[1];
    if (id) return { kind: "iframe", src: `https://player.vimeo.com/video/${id}` };
  }
  if (host === "player.vimeo.com") return { kind: "iframe", src: url };
  if (host.endsWith("loom.com")) {
    const id = u.pathname.match(/\/(?:share|embed)\/([\w-]+)/)?.[1];
    if (id) return { kind: "iframe", src: `https://www.loom.com/embed/${id}` };
  }
  if (host === "drive.google.com") {
    const id = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1];
    if (id) return { kind: "iframe", src: `https://drive.google.com/file/d/${id}/preview` };
  }
  if (/\.(mp4|webm|mov)$/i.test(u.pathname)) return { kind: "file", src: url };
  return null;
}

export function VideoEmbed({ url, title }: { url?: string | null; title: string }) {
  const e = toEmbed(url);
  if (!e) return null;
  return (
    <div className="aspect-video w-full overflow-hidden rounded-card bg-forest">
      {e.kind === "iframe" ? (
        <iframe src={e.src} title={title} className="size-full" loading="lazy"
          allow="accelerometer; encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
      ) : (
        <video src={e.src} title={title} controls preload="metadata" className="size-full" />
      )}
    </div>
  );
}
