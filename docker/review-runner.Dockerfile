FROM node:24-bookworm-slim

ARG CODEX_VERSION=0.139.0

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates git ripgrep \
    && npm install --global "@openai/codex@${CODEX_VERSION}" \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

ENTRYPOINT []
