# TattooSafe Full AR

Opt-in body tracking in TattooSafe's camera preview. The standard preview is a
static overlay the visitor drags into place; Full AR finds their body with
MediaPipe and keeps the design on the placement they picked as they move:
turned with the limb, foreshortened with it, curved to its measured width, and
hidden where clothing covers the skin. Everything runs in the visitor's tab.
Nothing is uploaded, so the tool stays client-side (not `tier: 'cloud'`).

It costs a download of about 30 MB, so nothing loads until the visitor presses
**Full AR (body tracking)** and accepts the notice, which states the download,
the face-first requirement, the device load, and that the size is an estimate.

## Files

| File | Role |
|---|---|
| `src/ar-anchor.ts` | Pure geometry, unit-tested: which landmarks each placement anchors to, px-per-cm from the entered height, side choice, smoothing, limb width from the mask. No MediaPipe import. |
| `src/ar-tracking.ts` | The lazily loaded chunk: downloads and hash-checks the models, creates the pose landmarker and the segmenter, picks GPU or CPU. Imported only after the notice. |
| `src/camera.ts` | The camera preview. Full AR is a mode of it (`startAr` / `stopAr`): front camera, mirrored view, tracking per frame, drawing on the anchor. |
| `src/ar-assets.json` | Single source for the runtime version and each model's URL, SHA-256, size and served file name. Read by the build script and the browser. |
| `scripts/fetch-ar-assets.mjs` | Fills `public/ar/` (gitignored) before every `npm run dev` and `npm run build`. |

## The assets

| Served at `/tools/tattoosafe/ar/` | Size | From |
|---|---|---|
| `wasm-<version>/vision_wasm_internal.{js,wasm}` | 13.5 MB (about 4 MB gzipped) | `@mediapipe/tasks-vision` in `node_modules`, verified by npm against `package-lock.json` |
| `wasm-<version>/vision_wasm_nosimd_internal.{js,wasm}` | 12.6 MB | same; only browsers without WebAssembly SIMD load it |
| `models/pose_landmarker_full-<sha12>.task` | 9.4 MB | Google's versioned model URL, checked against the pinned SHA-256 |
| `models/selfie_multiclass_256x256-<sha12>.tflite` | 16.4 MB | same |

`fetch-ar-assets.mjs` copies the runtime, then for each model tries the
pinned upstream URL and, if that fails or serves different bytes, the copy
already live at `https://restless-forge.dev/tools/tattoosafe/ar/models/` (the
file name carries the hash, so it can only be the pinned file). Every download
must match its SHA-256. If neither source works, the build fails: deploys
rsync with `--delete`, so a build without the models would also delete the
live copies that are the fallback.

Upstream URLs are the versioned ones (`…/float16/1/…`), never `latest`: the
`latest` pose model already serves different bytes from `/1/` (the same
networks, repackaged with new zip timestamps), which would fail the hash.

## Serving

- **nginx:** `location ^~ /tools/tattoosafe/ar/` in `nginx/restless-forge.conf`
  serves these files with a one-year `immutable` cache and the security headers
  (the `add_header` gotcha applies), and `gzip_types` includes
  `application/wasm`. Every path changes when its content does (runtime
  version in the directory, model hash in the file name), so nothing needs
  cache-busting. `npm run check-urls` (check 8) asserts all of this against the
  real vhost.
- **Cloudflare:** by default Cloudflare caches by file extension, and `wasm`,
  `task` and `tflite` are not on its list (`js` is), so without a rule every
  first download comes from the droplet. Add a Cache Rule once:
  1. Cloudflare dashboard → `restless-forge.dev` → **Caching** → **Cache Rules** → **Create rule**.
  2. Name it "TattooSafe Full AR files".
  3. **If incoming requests match** a custom filter expression: field **URI Path**, operator **starts with**, value `/tools/tattoosafe/ar/`.
  4. **Cache eligibility:** Eligible for cache.
  5. **Edge TTL:** use the cache-control header if present (nginx sends one year, immutable).
  6. **Browser TTL:** respect origin.
  7. Deploy. Check with
     `curl -sI https://restless-forge.dev/tools/tattoosafe/ar/models/pose_landmarker_full-5134a3aad27a.task | grep -i cf-cache-status`:
     `MISS` the first time, `HIT` after.

  The largest file is 16 MB; the Free plan caches files up to 512 MB.

## Updating the runtime or a model

1. Runtime: `npm install --save-exact @mediapipe/tasks-vision@<version>` in
   `tools/tattoosafe/frontend` (pick a release at least two weeks old), and set
   `tasksVision` in `src/ar-assets.json` to the same version. The fetch script
   refuses to run while they differ.
2. Model: take its versioned URL, then
   `curl -sSL <url> | sha256sum` and `curl -sSL <url> | wc -c`. Set `url`,
   `sha256`, `bytes`, and a `file` name ending in the first 12 hex characters
   of the hash.
3. `npm run ar-assets`, then test as below. The size in the notice ("about
   30 MB") and in the FAQ follows the models; change both if it moves.

## Why these models

- **Pose: full, not heavy.** Measured in headless Chromium in a cloud
  container (CPU delegate, MediaPipe's own `pose.jpg` test image), per frame:
  lite 33 ms, full 48 ms, heavy 152 ms. All three put the wrists and
  knees within 0.5% of the frame of each other. Heavy would add 21 MB and cut
  the frame rate to a third for no visible gain.
- **Segmenter: selfie multiclass.** Its categories separate body skin from
  clothes, which gives both the "hide under clothing" clip and the limb width
  that drives the automatic curvature.
- **GPU or CPU.** The GPU delegate is tried first, except when WebGL is a
  software renderer (SwiftShader, llvmpipe): there it measured about five times
  slower than the CPU delegate, so the CPU delegate is used.

## Known limits

- **It finds the face first.** MediaPipe's pose detector locates a person by
  their face, so a close-up of one limb never locks on. The visitor has to prop
  the phone up or use a mirror, which makes the design small on screen.
- **Eight placements:** inner and outer forearm, upper arm, shoulder, chest,
  sternum, thigh, calf. Wrist, hand and behind the ear are too small for a body
  model; upper and lower back and the back of the neck can't be filmed by the
  wearer. Those stay manual inside Full AR.
- **Size is an estimate.** Scale comes from the entered height and typical
  segment proportions (Drillis and Contini), using the longest-looking
  segments, since a limb pointing at the camera looks short. Individual
  proportions and landmark positions each vary by a few percent; the error has
  not been measured on real people. The standard preview's card calibration is
  the exact route.
- **Not tested on real phones yet.** Headless Chromium proves the pipeline,
  not the frame rate or iOS Safari's WebGL quirks.

## Testing

- Unit: `src/__tests__/ar-anchor.test.ts` covers the geometry.
- End to end (manual, not in CI): Chromium accepts a video file as a fake
  camera. Convert MediaPipe's test photo
  (`https://storage.googleapis.com/mediapipe-assets/pose.jpg`) with
  `ffmpeg -loop 1 -i pose.jpg -t 2 -r 10 -vf "scale=960:640,format=yuv420p" person.y4m`
  and launch Chromium with `--use-fake-device-for-media-stream
  --use-fake-ui-for-media-stream --use-file-for-fake-video-capture=person.y4m`.
  Turning Full AR on should reach the tracking hint within seconds, and the
  design should sit on each of the eight placements. The figure in that photo
  wears a tank top and shorts, so the chest design vanishes with "Hide under
  clothing" on and the thigh design is cut off at the shorts.
