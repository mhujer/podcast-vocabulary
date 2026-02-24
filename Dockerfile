FROM node:24-slim

ARG APP_DIR=/podcast-vocabulary

# Install git, curl, and python3 for Claude Code (python3 needed for custom statusline)
RUN apt-get update && apt-get install -y git curl python3 ffmpeg && rm -rf /var/lib/apt/lists/*

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

# Default command: install deps then run dev mode
CMD ["bash", "-c", "npm install && npm run dev"]
