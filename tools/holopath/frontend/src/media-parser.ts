/**
 * HoloPath — Media parser (client-side).
 *
 * Unified frame extraction for:
 *   - Static images (JPG, PNG, WebP, BMP)
 *   - Animated GIFs (via custom GIF decoder)
 *   - Videos (MP4, WebM, MOV via HTML5 <video>)
 *
 * All processing in-browser. No server calls.
 */

import { decodeGif, isAnimatedGif } from "./gif-decoder";

// ─── Types ──────────────────────────────────────────

export interface ParsedFrame {
  imageData: ImageData;
  delay: number; // ms
}

export interface ParsedMedia {
  frames: ParsedFrame[];
  sourceType: "static" | "gif" | "video";
  width: number;
  height: number;
}

// ─── Constants ──────────────────────────────────────

export const IMG_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"]);
export const VID_EXTS = new Set([".mp4", ".webm", ".mov", ".m4v", ".ogg"]);
export const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const TARGET_VIDEO_FPS = 10;
const MAX_VIDEO_FRAMES = 900; // ~90s at 10fps; browser memory is the real limit

// ─── Source detection ───────────────────────────────

export function getExt(filename: string): string {
  return "." + (filename.split(".").pop()?.toLowerCase() || "");
}

export function detectSourceType(filename: string): "static" | "gif" | "video" {
  const ext = getExt(filename);
  if (VID_EXTS.has(ext)) return "video";
  if (ext === ".gif") return "gif";
  return "static";
}

export function validateFile(name: string, size: number): string | null {
  const ext = getExt(name);
  if (!IMG_EXTS.has(ext) && !VID_EXTS.has(ext)) return "Unsupported file type";
  if (size > MAX_FILE_SIZE) return "File too large (max 15 MB)";
  return null;
}

// ─── Image loading helpers ──────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function imageToImageData(img: HTMLImageElement, maxWidth: number = 800): ImageData {
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w > maxWidth) {
    const scale = maxWidth / w;
    w = maxWidth;
    h = Math.round(h * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// ─── Static image parser ────────────────────────────

async function parseStaticImage(file: File, maxWidth: number): Promise<ParsedMedia> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const data = imageToImageData(img, maxWidth);
    return {
      frames: [{ imageData: data, delay: 80 }],
      sourceType: "static",
      width: data.width,
      height: data.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ─── Animated GIF parser ────────────────────────────

async function parseAnimatedGif(file: File, maxWidth: number): Promise<ParsedMedia> {
  const buffer = await file.arrayBuffer();
  const raw = new Uint8Array(buffer);

  // Check if actually animated
  if (!isAnimatedGif(raw)) {
    // Single-frame GIF — treat as static
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const data = imageToImageData(img, maxWidth);
      return {
        frames: [{ imageData: data, delay: 80 }],
        sourceType: "static",
        width: data.width,
        height: data.height,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Try custom GIF decoder first
  let decoded: ReturnType<typeof decodeGif> | null = null;
  try {
    decoded = decodeGif(raw);
  } catch {
    decoded = null;
  }

  // Validate decoded frames aren't all black (corrupt decode)
  if (decoded && decoded.frames.length > 0) {
    const testFrame = decoded.frames[0].imageData;
    const d = testFrame.data;
    let totalBrightness = 0;
    const sampleStep = Math.max(1, Math.floor(d.length / 4 / 500));
    for (let i = 0; i < d.length; i += sampleStep * 4) {
      totalBrightness += d[i] + d[i + 1] + d[i + 2];
    }
    if (totalBrightness === 0) {
      // All-black output means decoder failed — null it out for fallback
      decoded = null;
    }
  }

  // Fallback: use browser-native rendering (captures single composed frame)
  if (!decoded || decoded.frames.length === 0) {
    console.warn("Custom GIF decoder failed, using browser-native fallback");
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      const data = imageToImageData(img, maxWidth);
      return {
        frames: [{ imageData: data, delay: 80 }],
        sourceType: "static",
        width: data.width,
        height: data.height,
      };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // Resize frames if needed
  const frames: ParsedFrame[] = [];
  for (const f of decoded.frames) {
    let data = f.imageData;
    if (data.width > maxWidth) {
      const nw = maxWidth;
      const nh = Math.round(data.height * (maxWidth / data.width));
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = data.width;
      srcCanvas.height = data.height;
      srcCanvas.getContext("2d")!.putImageData(data, 0, 0);

      const dstCanvas = document.createElement("canvas");
      dstCanvas.width = nw;
      dstCanvas.height = nh;
      const dctx = dstCanvas.getContext("2d")!;
      dctx.drawImage(srcCanvas, 0, 0, nw, nh);
      data = dctx.getImageData(0, 0, nw, nh);
    }
    frames.push({ imageData: data, delay: f.delay });
  }

  return {
    frames,
    sourceType: "gif",
    width: frames[0]?.imageData.width || decoded.width,
    height: frames[0]?.imageData.height || decoded.height,
  };
}

// ─── Video parser ───────────────────────────────────

function createVideoElement(file: File): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";

    const url = URL.createObjectURL(file);
    video.src = url;

    video.onloadedmetadata = () => {
      // Store url for cleanup
      (video as any)._blobUrl = url;
      resolve(video);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load video. Format may not be supported by your browser."));
    };
  });
}

function seekAndCapture(
  video: HTMLVideoElement,
  time: number,
  maxWidth: number,
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    video.currentTime = time;
    video.onseeked = () => {
      let w = video.videoWidth;
      let h = video.videoHeight;
      if (w > maxWidth) {
        const scale = maxWidth / w;
        w = maxWidth;
        h = Math.round(h * scale);
      }
      // Make dimensions even
      w = w + (w % 2);
      h = h + (h % 2);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, w, h);
      resolve(ctx.getImageData(0, 0, w, h));
    };
    video.onerror = () => reject(new Error("Video seek failed"));
  });
}

async function parseVideo(
  file: File,
  maxWidth: number,
  onProgress?: (p: number) => void,
): Promise<ParsedMedia> {
  const video = await createVideoElement(file);

  try {
    const duration = video.duration;
    if (!isFinite(duration) || duration <= 0) {
      throw new Error("Cannot determine video duration");
    }

    const fps = TARGET_VIDEO_FPS;
    let numFrames = Math.min(Math.round(duration * fps), MAX_VIDEO_FRAMES);
    const delayMs = Math.max(20, Math.round(1000 / fps));

    const frames: ParsedFrame[] = [];
    for (let i = 0; i < numFrames; i++) {
      const time = (i / numFrames) * duration;
      try {
        const data = await seekAndCapture(video, time, maxWidth);
        frames.push({ imageData: data, delay: delayMs });
      } catch {
        // Skip failed frames
      }
      if (onProgress) onProgress((i + 1) / numFrames);
    }

    if (frames.length === 0) {
      throw new Error("Failed to extract any video frames");
    }

    return {
      frames,
      sourceType: "video",
      width: frames[0].imageData.width,
      height: frames[0].imageData.height,
    };
  } finally {
    URL.revokeObjectURL((video as any)._blobUrl);
  }
}

// ─── Public API ─────────────────────────────────────

/**
 * Parse a file into frames. Handles images, animated GIFs, and videos.
 *
 * @param file - The uploaded File object
 * @param maxWidth - Maximum frame width (default 512)
 * @param onProgress - Progress callback for video parsing
 */
export async function parseMedia(
  file: File,
  maxWidth: number = 512,
  onProgress?: (progress: number) => void,
): Promise<ParsedMedia> {
  const ext = getExt(file.name);

  if (VID_EXTS.has(ext)) {
    return parseVideo(file, maxWidth, onProgress);
  }

  if (ext === ".gif") {
    return parseAnimatedGif(file, maxWidth);
  }

  return parseStaticImage(file, maxWidth);
}
