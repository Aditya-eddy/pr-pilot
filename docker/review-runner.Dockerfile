FROM node:24-bookworm-slim

ARG CODEX_VERSION=0.139.0
ARG CLAUDE_CODE_VERSION=2.1.177

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates git ripgrep \
    && npm install --global \
        "@openai/codex@${CODEX_VERSION}" \
        "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
    && codex --version \
    && claude --version \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

ENTRYPOINT []
