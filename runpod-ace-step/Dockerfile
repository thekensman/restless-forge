# ACE-Step 1.5 worker for RunPod Serverless (Rise & Rhyme v2).
#
# Model weights are baked in at build time. Downloading them on first request
# instead would put ~10 GB on the critical path of a cold start, which on a
# scale-to-zero endpoint is every first song of the day.
#
# Build + push (needs Docker; GPU not required to BUILD, only to run — except
# the weight-prefetch layer below, which is CPU-only by design):
#   docker build -t <dockerhub-user>/ace-step-worker:latest .
#   docker push  <dockerhub-user>/ace-step-worker:latest

FROM pytorch/pytorch:2.6.0-cuda12.4-cudnn9-runtime

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      git ffmpeg libsndfile1 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Prefetch weights into the image. Uses snapshot_download rather than
# instantiating the pipeline, so this layer needs no GPU and stays cacheable.
ARG ACE_STEP_MODEL=ACE-Step/acestep-v15-xl-turbo-diffusers
ENV ACE_STEP_MODEL=${ACE_STEP_MODEL}
RUN python -c "from huggingface_hub import snapshot_download; import os; \
snapshot_download(os.environ['ACE_STEP_MODEL'])"

COPY handler.py .

CMD ["python", "-u", "handler.py"]
