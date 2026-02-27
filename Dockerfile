FROM ghcr.io/ggml-org/whisper.cpp:main AS whisper

FROM node:24-slim

ARG APP_DIR=/podcast-vocabulary

# Install git, curl, python3/pip, and ffmpeg
RUN apt-get update && apt-get install -y git curl python3 python3-pip python3-venv ffmpeg && rm -rf /var/lib/apt/lists/*

# Install Parakeet dependencies (onnx-asr with hub support + onnxruntime)
RUN pip3 install --break-system-packages onnx-asr[hub] onnxruntime

# Copy whisper-cli binary, shared libraries, and model download script from whisper build stage
COPY --from=whisper /app/build/bin/whisper-cli /usr/local/bin/whisper-cli
COPY --from=whisper /app/build/src/libwhisper.so.1 /usr/local/lib/
COPY --from=whisper /app/build/ggml/src/libggml.so.0 /usr/local/lib/
COPY --from=whisper /app/build/ggml/src/libggml-base.so.0 /usr/local/lib/
COPY --from=whisper /app/build/ggml/src/libggml-cpu.so.0 /usr/local/lib/
RUN ldconfig
COPY --from=whisper /app/models/download-ggml-model.sh /usr/local/bin/download-ggml-model.sh

# Set home for non-root user
ENV HOME=/home/node

# Prepare home directory for non-root execution
RUN mkdir -p /home/node/.local/bin && chown -R node:node /home/node

WORKDIR ${APP_DIR}
RUN chown -R node:node ${APP_DIR}

# Fix dubious ownership error from git
RUN git config --system --add safe.directory ${APP_DIR}

# Install TypeScript LSP for Claude to use
RUN npm install -g typescript-language-server typescript

# Switch to non-root user for remaining operations
USER node

# Install Claude Code using native method (recommended)
RUN curl -fsSL https://claude.ai/install.sh | bash

# Add Claude Code to PATH
ENV PATH="/home/node/.local/bin:${PATH}"

# Add Claude Code to shell config for interactive sessions
RUN echo 'export PATH="$HOME/.local/bin:$PATH"' >> /home/node/.bashrc

# Fix Claude Code colors (https://ranang.medium.com/fixing-claude-codes-flat-or-washed-out-remote-colors-82f8143351ed)
ENV COLORTERM=truecolor

EXPOSE 3000

# Copy Parakeet scripts
COPY scripts/transcribe.py /usr/local/bin/parakeet-transcribe.py
COPY scripts/download-parakeet.py /usr/local/bin/download-parakeet.py

# Default command: download models if missing, install deps, run dev
CMD ["bash", "-c", "\
  test -f /podcast-vocabulary/data/whisper/ggml-medium.bin || download-ggml-model.sh medium /podcast-vocabulary/data/whisper && \
  test -d /podcast-vocabulary/data/parakeet/hub || HF_HOME=/podcast-vocabulary/data/parakeet python3 /usr/local/bin/download-parakeet.py && \
  npm install && npm run dev"]
