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
  /** Target video bitrate, bits per second. */
  videoBitrate?: number;
  /** 0–100 while a video is being compressed. */
  onProgress?: (percent: number) => void;
};

export const CONTENT_MEDIA: CompressOptions = { maxImage: 2160, imageQuality: 0.88, maxVideoShort: 1080, videoBitrate: 6_000_000 };
export const TUTORIAL_VIDEO: CompressOptions = { maxVideoShort: 1080, videoBitrate: 2_500_000 };
export const ATTACHMENT: CompressOptions = { maxImage: 2400, imageQuality: 0.85, maxVideoShort: 720, videoBitrate: 2_000_000 };

const KEEP_IF_UNDER = { image: 400 * 1024, video: 8 * 1024 * 1024 };

export async function compressFile(file: File, o: CompressOptions = {}): Promise<File> {
  try {
    if (/^image\/(jpeg|png|webp)$/.test(file.type) && file.size > KEEP_IF_UNDER.image) return await compressImage(file, o);
    if (file.type.startsWith("video/") && file.size > KEEP_IF_UNDER.video) return await compressVideo(file, o);
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

async function compressVideo(file: File, o: CompressOptions) {
  if (typeof VideoEncoder === "undefined") return file;
  const { Input, Output, Conversion, ALL_FORMATS, BlobSource, BufferTarget, Mp4OutputFormat, canEncodeVideo } = await import("mediabunny");
  if (!(await canEncodeVideo("avc"))) return file;

  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track || !(await track.canDecode())) return file;
  const w = track.displayWidth, h = track.displayHeight;
  const short = o.maxVideoShort ?? 1080;
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const resize = Math.min(w, h) > short ? (w <= h ? { width: even(short) } : { height: even(short) }) : {};

  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });
  const conversion = await Conversion.init({
    input, output, showWarnings: false,
    video: { ...resize, codec: "avc", bitrate: o.videoBitrate ?? 4_000_000, forceTranscode: true },
  });
  // Never drop the sound or a track to save space.
  if (!conversion.isValid || conversion.discardedTracks.length > 0) return file;
  // Watchdog: if the browser stops making progress for 20 s, give up and upload the original.
  let last = Date.now(), stalled = false;
  conversion.onProgress = (p) => { last = Date.now(); o.onProgress?.(Math.min(99, Math.round(p * 100))); };
  const watch = setInterval(() => {
    if (Date.now() - last > 20_000) { stalled = true; clearInterval(watch); void conversion.cancel(); }
  }, 2000);
  try { await conversion.execute(); } catch (e) { if (stalled) return file; throw e; } finally { clearInterval(watch); }
  if (stalled) return file;
  o.onProgress?.(100);
  if (!target.buffer) return file;
  return smaller(file, new Blob([target.buffer], { type: "video/mp4" }), rename(file.name, "mp4"), "video/mp4");
}
