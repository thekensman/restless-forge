/**
 * HoloGen — Video encoder (client-side).
 *
 * Encodes rendered hologram frames to MP4 or WebM using
 * the browser's MediaRecorder API + Canvas captureStream.
 *
 * Browser support:
 *   Chrome/Edge: WebM (VP8/VP9) or MP4 (H.264 if available)
 *   Firefox: WebM (VP8)
 *   Safari: MP4 (H.264)
 */

export interface VideoFrame {
  data: ImageData;
  delay: number; // ms
}

export interface VideoEncodeResult {
  blob: Blob;
  mimeType: string;
  extension: string;
}

// ─── MIME type detection ────────────────────────────

const PREFERRED_TYPES = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=h264",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

function getBestMimeType(): { mimeType: string; extension: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of PREFERRED_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) {
      const ext = type.startsWith("video/mp4") ? "mp4" : "webm";
      return { mimeType: type, extension: ext };
    }
  }
  return null;
}

export function isVideoExportSupported(): boolean {
  return getBestMimeType() !== null;
}

export function getVideoExportFormat(): string {
  const best = getBestMimeType();
  return best ? best.extension.toUpperCase() : "N/A";
}

// ─── Frame-by-frame video encoding ──────────────────

/**
 * Encode rendered frames to MP4 or WebM.
 *
 * Draws each frame to a hidden canvas at the correct timing,
 * captures via MediaRecorder, and returns a video Blob.
 */
export async function encodeVideo(
  frames: VideoFrame[],
  onProgress?: (progress: number) => void,
): Promise<VideoEncodeResult> {
  if (frames.length === 0) throw new Error("No frames to encode");

  const format = getBestMimeType();
  if (!format) throw new Error("Video recording not supported in this browser");

  const width = frames[0].data.width;
  const height = frames[0].data.height;

  // Ensure even dimensions (required by most codecs)
  const encW = width + (width % 2);
  const encH = height + (height % 2);

  // Create offscreen canvas
  const canvas = document.createElement("canvas");
  canvas.width = encW;
  canvas.height = encH;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;


  // Set up MediaRecorder
  const stream = canvas.captureStream(0); // 0 = manual frame capture
  const recorder = new MediaRecorder(stream, {
    mimeType: format.mimeType,
    videoBitsPerSecond: 2_000_000, // 2 Mbps
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise<VideoEncodeResult>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("MediaRecorder error"));

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: format.mimeType });
      resolve({
        blob,
        mimeType: format.mimeType,
        extension: format.extension,
      });
    };

    recorder.start();

    // Draw frames sequentially with proper timing
    let frameIdx = 0;

    function drawNextFrame() {
      if (frameIdx >= frames.length) {
        recorder.stop();
        return;
      }

      const frame = frames[frameIdx];

      // Clear and draw (handles even-dimension padding)
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, encW, encH);
      ctx.putImageData(frame.data, 0, 0);

      // Request a frame capture from the stream
      const track = stream.getVideoTracks()[0];
      if (track && "requestFrame" in track) {
        (track as any).requestFrame();
      }

      if (onProgress) {
        onProgress((frameIdx + 1) / frames.length);
      }

      frameIdx++;

      // Schedule next frame with the correct delay
      const delay = Math.max(16, frame.delay); // minimum ~60fps cap
      setTimeout(drawNextFrame, delay);
    }

    drawNextFrame();
  });
}
