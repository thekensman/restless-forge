"""RunPod Serverless handler — ACE-Step 1.5 song generation for Rise & Rhyme.

Contract with backend/services/runpod_client.py (keep the two in step):

  input   {lyrics: str, prompt: str, duration: float, seed?: int}
  output  {status: "ok", audio_base64: <mp3>, sample_rate, duration_seconds}
       |  {status: "error", message: str}

`prompt` and `lyrics` are SEPARATE arguments to the pipeline — prompt describes
the music, lyrics are sung. Concatenating them into one string (as the original
migration note did) makes the model treat the genre tags as words to sing.

Lyrics arrive already tagged with [verse] / [chorus] section markers; ACE-Step
uses those for structure, and an untagged block produces a shapeless result.
"""

import base64
import os
import subprocess
import tempfile
import traceback

import runpod
import soundfile as sf
import torch
from diffusers import AceStepPipeline

MODEL_ID = os.getenv("ACE_STEP_MODEL", "ACE-Step/acestep-v15-xl-turbo-diffusers")
MP3_BITRATE = os.getenv("MP3_BITRATE", "128k")
MAX_DURATION = float(os.getenv("MAX_DURATION_SEC", "90"))

# Loaded once per worker, not per request: this is the whole reason a warm
# worker answers in seconds while a cold start takes a minute.
pipe = AceStepPipeline.from_pretrained(MODEL_ID, dtype=torch.bfloat16).to("cuda")


def _to_mp3(wav_path: str, mp3_path: str) -> None:
    """WAV -> MP3 via ffmpeg.

    soundfile cannot reliably write MP3 (libsndfile only gained MP3 write in
    1.1.0, and the wheels bundled with many CUDA base images predate it), so
    the encode goes through ffmpeg, which the image installs anyway.
    """
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", wav_path,
         "-codec:a", "libmp3lame", "-b:a", MP3_BITRATE, mp3_path],
        check=True,
    )


def handler(event):
    data = event.get("input") or {}
    lyrics = (data.get("lyrics") or "").strip()
    prompt = (data.get("prompt") or "upbeat morning pop, bright, cheerful").strip()
    duration = float(data.get("duration") or 60)
    seed = data.get("seed")

    if not lyrics:
        return {"status": "error", "message": "no lyrics supplied"}
    # Clamp rather than reject: duration drives GPU seconds, which is the bill.
    duration = max(10.0, min(duration, MAX_DURATION))

    try:
        kwargs = {"prompt": prompt, "lyrics": lyrics, "audio_duration": duration}
        if seed is not None:
            kwargs["generator"] = torch.Generator(device="cuda").manual_seed(int(seed))

        audio = pipe(**kwargs).audios
        sample_rate = pipe.sample_rate

        # .audios[0] is (channels, samples) on GPU; soundfile wants
        # (samples, channels) on CPU as float32.
        samples = audio[0].T.cpu().float().numpy()

        with tempfile.TemporaryDirectory() as tmp:
            wav_path = os.path.join(tmp, "song.wav")
            mp3_path = os.path.join(tmp, "song.mp3")
            sf.write(wav_path, samples, sample_rate)
            _to_mp3(wav_path, mp3_path)
            with open(mp3_path, "rb") as fh:
                audio_b64 = base64.b64encode(fh.read()).decode()

        return {
            "status": "ok",
            "audio_base64": audio_b64,
            "sample_rate": sample_rate,
            "duration_seconds": samples.shape[0] / sample_rate,
        }
    except Exception as exc:  # noqa: BLE001 — must surface as a job result
        # Never let the worker die on one bad request: a raised exception marks
        # the job FAILED with no detail, and the caller only sees a timeout.
        traceback.print_exc()
        return {"status": "error", "message": f"{type(exc).__name__}: {exc}"}


runpod.serverless.start({"handler": handler})
