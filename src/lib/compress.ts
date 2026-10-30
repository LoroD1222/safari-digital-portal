"use client";

// Shrinks images and videos in the browser before they upload.
// Always safe: on any problem (old browser, odd format) the original file is used,
// and a "compressed" file that isn't clearly smaller is thrown away.

export type CompressOptions = {
  /** Longest side for images, px. */
  maxImage?: number;
  /** JPEG quality 0–1. */
  imageQuality?: number;
  /** Shortest side for videos, px (1080 = Full HD Reels). */
  maxVideoShort?: number;
  /** Target video bitrate, bits per second (the most it uses; lowered to fit maxBytes). */
  videoBitrate?: number;
  /** Videos must end up under this many bytes; bitrate, then resolution, are lowered to fit. */
  maxBytes?: number;
  /** Encoder to use (tests only). */
  codec?: "avc" | "vp9";
  /** 0–100 while a video is being compressed. */
  onProgress?: (percent: number) => void;
};

// Content videos must fit Supabase's 50 MB per-file limit, with room to spare.
export const MAX_UPLOAD = 50 * 1024 * 1024;
export const CONTENT_MEDIA: CompressOptions = { maxImage: 2160, imageQuality: 0.88, maxVideoShort: 1080, videoBitrate: 5_000_000, maxBytes: 46 * 1024 * 1024 };
export const TUTORIAL_VIDEO: CompressOptions = { maxVideoShort: 1080, videoBitrate: 2_500_000 };
export const ATTACHMENT: CompressOptions = { maxImage: 2400, imageQuality: 0.85, maxVideoShort: 720, videoBitrate: 2_000_000 };

const KEEP_IF_UNDER = { image: 400 * 1024, video: 8 * 1024 * 1024 };

export async function compressFile(file: File, o: CompressOptions = {}): Promise<File> {
  try {
    if (/^image\/(jpeg|png|webp)$/.test(file.type) && file.size > KEEP_IF_UNDER.image) return await compressImage(file, o);
    if (file.type.startsWith("video/") && (file.size > KEEP_IF_UNDER.video || (o.maxBytes && file.size > o.maxBytes))) return await compressVideo(file, o);
  } catch (e) {
    console.warn("Compression skipped, uploading the original.", e);
  }
  return file;
}

function smaller(original: File, result: Blob, name: string, type: string) {
  return result.size < original.size * 0.9 ? new File([result], name, { type, lastModified: Date.now() }) : original;
}
function rename(name: string, ext: string) {
  return name.replace(/\.[^.]+$/, "") + "." + ext;
}

async function compressImage(file: File, o: CompressOptions) {
  const max = o.maxImage ?? 2400;
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();

  // PNGs with transparency (logos, screenshots with cut-outs) stay PNG.
  let alpha = false;
  if (file.type === "image/png") {
    const px = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < px.length; i += 16) if (px[i] < 255) { alpha = true; break; }
  }
  const type = alpha ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, o.imageQuality ?? 0.85));
  if (!blob) return file;
  return smaller(file, blob, rename(file.name, alpha ? "png" : "jpg"), type);
}

// Bitrate that fits `maxBytes` over the clip's length, keeping room for sound and the file's own overhead.
function plan(duration: number, o: CompressOptions, audioBps: number) {
  const cap = o.videoBitrate ?? 4_000_000;
  const short = o.maxVideoShort ?? 1080;
  if (!o.maxBytes || !duration) return { bitrate: cap, short };
  const budget = (o.maxBytes * 8 * 0.94) / duration - audioBps; // 6% for container + encoder overshoot
  const bitrate = Math.max(250_000, Math.min(cap, Math.floor(budget)));
  // Too few bits for Full HD to look good: use a smaller picture instead of a blocky one.
  const fit = bitrate >= 2_500_000 ? short : bitrate >= 1_200_000 ? Math.min(short, 720) : Math.min(short, 540);
  return { bitrate, short: fit };
}

async function compressVideo(file: File, o: CompressOptions) {
  if (typeof VideoEncoder === "undefined") return file;
  const mb = await import("mediabunny");
  const codec = o.codec ?? "avc";
  if (!(await mb.canEncodeVideo(codec))) return file;
  const probe = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const track = await probe.getPrimaryVideoTrack();
  if (!track || !(await track.canDecode())) return file;
  const duration = await probe.computeDuration();
  const aac = await mb.canEncodeAudio("aac").catch(() => false);
  const audioBps = aac ? 128_000 : 320_000; // re-encode sound at 128 kbps when we can; otherwise assume up to 320 kbps
  let { bitrate, short } = plan(duration, o, audioBps);

  let best: File = file;
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await encode(mb, file, o, { codec, bitrate, short, aac, w: track.displayWidth, h: track.displayHeight });
    if (!out) return best;
    if (out.size < best.size) best = out;
    if (!o.maxBytes || out.size <= o.maxBytes) break;
    // Encoders sometimes overshoot: try again with fewer bits, and a smaller picture if needed.
    bitrate = Math.max(200_000, Math.floor(bitrate * (o.maxBytes / out.size) * 0.85));
    if (bitrate < 1_200_000) short = Math.min(short, 540); else if (bitrate < 2_500_000) short = Math.min(short, 720);
    o.onProgress?.(0);
  }
  o.onProgress?.(100);
  if (best === file) return file;
  // Under the limit counts as a win even when it isn't 10% smaller.
  return o.maxBytes && file.size > o.maxBytes && best.size <= o.maxBytes ? best : smaller(file, best, best.name, best.type);
}

async function encode(
  mb: typeof import("mediabunny"), file: File, o: CompressOptions,
  p: { codec: "avc" | "vp9"; bitrate: number; short: number; aac: boolean; w: number; h: number },
): Promise<File | null> {
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const resize = Math.min(p.w, p.h) > p.short ? (p.w <= p.h ? { width: even(p.short) } : { height: even(p.short) }) : {};
  const target = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const conversion = await mb.Conversion.init({
    input, output, showWarnings: false,
    // 30 fps is plenty for Reels and halves the data of 60 fps phone videos.
    video: { ...resize, codec: p.codec, bitrate: p.bitrate, frameRate: 30, forceTranscode: true },
    ...(p.aac ? { audio: { codec: "aac" as const, bitrate: 128_000 } } : {}),
  });
  // Never drop the sound or a track to save space.
  if (!conversion.isValid || conversion.discardedTracks.length > 0) return null;
  // Watchdog: if the browser stops making progress for 20 s, give up.
  let last = Date.now(), stalled = false;
  conversion.onProgress = (x) => { last = Date.now(); o.onProgress?.(Math.min(99, Math.round(x * 100))); };
  const watch = setInterval(() => {
    if (Date.now() - last > 20_000) { stalled = true; clearInterval(watch); void conversion.cancel(); }
  }, 2000);
  try { await conversion.execute(); } catch (e) { if (stalled) return null; throw e; } finally { clearInterval(watch); }
  if (stalled || !target.buffer) return null;
  return new File([target.buffer], rename(file.name, "mp4"), { type: "video/mp4", lastModified: Date.now() });
}
