#!/bin/sh
# Downloads LLM models into the stack's Ollama volume (CONNECTED machine only).
# The ollama service itself runs on the internal network and can never download anything.
# Retries until each model is complete: Ollama resumes partial downloads, so a slow or
# flaky connection only costs time.
# Usage: scripts/pull-llm-models.sh [model ...]   (default: the configured extraction model)
set -e
OLLAMA_IMAGE=ollama/ollama:0.40.8
VOLUME=archive-inventory_ollama-models
MODELS="${*:-qwen2.5:3b-instruct-q4_K_M qwen2.5:7b-instruct-q4_K_M}"

docker volume create "$VOLUME" >/dev/null
docker run --rm -v "$VOLUME:/root/.ollama" --entrypoint sh "$OLLAMA_IMAGE" -c "
  ollama serve >/dev/null 2>&1 &
  until ollama list >/dev/null 2>&1; do sleep 1; done
  for m in $MODELS; do
    attempt=1
    until ollama pull \$m; do
      echo \">> \$m: attempt \$attempt failed, retrying in 30 s\"
      attempt=\$((attempt + 1)); sleep 30
    done
    echo \">> \$m: complete\"
  done
  ollama list
"
