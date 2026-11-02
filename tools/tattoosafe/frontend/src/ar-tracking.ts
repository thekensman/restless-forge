/**
 * TattooSafe — Full AR runtime (a lazily loaded chunk).
 *
 * Imported only after the visitor accepts the Full AR notice, so the page
 * itself never pays for it. Wraps MediaPipe Tasks Vision: the pose
 * landmarker says where the body is, and the multiclass selfie segmenter
 * says which pixels are skin and which are clothes. The face landmarker
 * (478-point face mesh) loads only when the face placement is first chosen.
 * All of them run in this tab.
 * The WASM runtime and the models are served from this site (see
 * scripts/fetch-ar-assets.mjs); nothing about the visitor goes anywhere.
 */
import { FaceLandmarker, FilesetResolver, ImageSegmenter, PoseLandmarker } from "@mediapipe/tasks-vision";
import assets from "./ar-assets.json";
import { FACE_TRIANGLES, FACE_UV, FACE_XYZ } from "./face-mesh";
import type { FaceMesh } from "./ar-face";

const AR_BASE = "/tools/tattoosafe/ar";
/** Width the segmenter sees; its model works at 256×256 anyway. */
const MASK_WIDTH = 256;

export interface TrackerOutput {
  /** 33 pose landmarks normalized to the video frame, or null if no one is found. */
  landmarks: { x: number; y: number; visibility: number }[] | null;
  /** Segmentation categories (see MASK_CLASS) covering the whole video frame. */
  mask: { data: Uint8Array; width: number; height: number } | null;
}

export interface Tracker {
  readonly delegate: "GPU" | "CPU";
  /** The canonical face mesh the face placement maps onto. */
  readonly faceMesh: FaceMesh;
  detect(video: HTMLVideoElement, tMs: number, withMask: boolean): TrackerOutput;
  /** True once loadFace() has finished. */
  faceReady(): boolean;
  /** Download and start the face landmarker (first time the face is chosen). */
  loadFace(onProgress: (loaded: number, total: number) => void): Promise<void>;
  /** 478 face landmarks normalized to the video frame, or null if no face is found. */
  detectFace(video: HTMLVideoElement, tMs: number): { x: number; y: number }[] | null;
  close(): void;
}

/** Download size of the body models (the face model loads later, on demand). */
export const MODEL_BYTES = assets.models.pose.bytes + assets.models.segmenter.bytes;

async function download(file: string, sha256: string, onChunk: (n: number) => void): Promise<Uint8Array> {
  const res = await fetch(`${AR_BASE}/models/${file}`);
  if (!res.ok || !res.body) throw new Error(`model download failed (HTTP ${res.status})`);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    size += value.length;
    onChunk(value.length);
  }
  const buf = new Uint8Array(size);
  let off = 0;
  for (const p of parts) { buf.set(p, off); off += p.length; }
  // The build checked these bytes; check them again here, so a cache or
  // proxy that mangled the file fails loudly instead of as a broken model.
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
  if (hex !== sha256) throw new Error("model download was corrupted; reload and try again");
  return buf;
}

/** True when WebGL is a software renderer (no usable GPU), or missing. */
function softwareWebGl(): boolean {
  const gl = document.createElement("canvas").getContext("webgl2");
  if (!gl) return true;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return /swiftshader|llvmpipe|softpipe|software/i.test(renderer);
}

export async function createTracker(onProgress: (loaded: number, total: number) => void): Promise<Tracker> {
  let loaded = 0;
  const bump = (n: number): void => { loaded += n; onProgress(loaded, MODEL_BYTES); };
  const [fileset, poseModel, segModel] = await Promise.all([
    FilesetResolver.forVisionTasks(`${AR_BASE}/wasm-${assets.tasksVision}`),
    download(assets.models.pose.file, assets.models.pose.sha256, bump),
    download(assets.models.segmenter.file, assets.models.segmenter.sha256, bump),
  ]);

  const build = async (delegate: "GPU" | "CPU") => {
    const pose = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: poseModel.slice(), delegate },
      runningMode: "VIDEO",
      numPoses: 1,
    });
    try {
      const seg = await ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: segModel.slice(), delegate },
        runningMode: "VIDEO",
        outputCategoryMask: true,
        outputConfidenceMasks: false,
      });
      return { pose, seg };
    } catch (e) {
      pose.close();
      throw e;
    }
  };
  // The GPU path is much faster on a real GPU, but not every browser can
  // give MediaPipe a WebGL2 context it accepts, and where WebGL is emulated
  // in software it is several times slower than the CPU path.
  let delegate: "GPU" | "CPU" = softwareWebGl() ? "CPU" : "GPU";
  let tasks: Awaited<ReturnType<typeof build>>;
  try {
    tasks = await build(delegate);
  } catch (e) {
    if (delegate === "CPU") throw e;
    delegate = "CPU";
    tasks = await build("CPU");
  }
  const { pose, seg } = tasks;

  let face: FaceLandmarker | null = null;
  let faceLoad: Promise<void> | null = null;
  let lastFace = -1;

  const small = document.createElement("canvas");
  const sctx = small.getContext("2d", { willReadFrequently: true });
  // Each task needs strictly increasing timestamps.
  let lastPose = -1, lastSeg = -1;

  return {
    delegate,
    faceMesh: { tri: FACE_TRIANGLES, uv: FACE_UV, xyz: FACE_XYZ },
    faceReady: () => face !== null,
    loadFace(onProgress) {
      faceLoad ??= (async () => {
        const m = assets.models.face;
        let loaded = 0;
        const buf = await download(m.file, m.sha256, (n) => { loaded += n; onProgress(loaded, m.bytes); });
        face = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetBuffer: buf, delegate },
          runningMode: "VIDEO",
          numFaces: 1,
        });
      })();
      // A failed load can be retried by choosing the face again.
      faceLoad.catch(() => { faceLoad = null; });
      return faceLoad;
    },
    detectFace(video, tMs) {
      if (!face) return null;
      const t = Math.max(tMs, lastFace + 1);
      lastFace = t;
      const r = face.detectForVideo(video, t);
      const first = r.faceLandmarks[0];
      return first ? first.map((p) => ({ x: p.x, y: p.y })) : null;
    },
    detect(video, tMs, withMask) {
      const tp = Math.max(tMs, lastPose + 1);
      lastPose = tp;
      const r = pose.detectForVideo(video, tp);
      const first = r.landmarks[0];
      const landmarks = first ? first.map((p) => ({ x: p.x, y: p.y, visibility: p.visibility ?? 0 })) : null;
      r.close();

      let mask: TrackerOutput["mask"] = null;
      if (withMask && sctx && video.videoWidth) {
        const h = Math.max(1, Math.round((MASK_WIDTH * video.videoHeight) / video.videoWidth));
        if (small.width !== MASK_WIDTH || small.height !== h) {
          small.width = MASK_WIDTH;
          small.height = h;
        }
        sctx.drawImage(video, 0, 0, MASK_WIDTH, h);
        const ts = Math.max(tMs, lastSeg + 1);
        lastSeg = ts;
        const s = seg.segmentForVideo(small, ts);
        const cm = s.categoryMask;
        if (cm) mask = { data: cm.getAsUint8Array().slice(), width: cm.width, height: cm.height };
        s.close();
      }
      return { landmarks, mask };
    },
    close() {
      pose.close();
      seg.close();
      face?.close();
    },
  };
}
