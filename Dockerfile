FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates git openssh-client wget \
    && npm install -g @openai/codex \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production \
    PORT=80 \
    VIBES_ROOT=/vibes \
    VIBES_HOST_ROOT=/Users/boot/Documents/vibes \
    DATA_DIR=/data

COPY server.js index.html styles.css app.js favicon.svg ./

EXPOSE 80

CMD ["node", "server.js"]
