ARG NODE_IMAGE=node:22.22.3-bookworm-slim
ARG YT_DLP_VERSION=2026.06.09
ARG YOUTUBE_DL_HOST=https://api.github.com/repos/yt-dlp/yt-dlp/releases/tags/${YT_DLP_VERSION}
ARG FFMPEG_VERSION=7:5.1.8-0+deb12u1
ARG EXPECTED_FFMPEG_VERSION=5.1.8

FROM ${NODE_IMAGE} AS build

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
ARG YOUTUBE_DL_HOST
RUN YOUTUBE_DL_HOST=${YOUTUBE_DL_HOST} npm ci

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM ${NODE_IMAGE} AS production

ARG YT_DLP_VERSION
ARG FFMPEG_VERSION
ARG EXPECTED_FFMPEG_VERSION

ENV NODE_ENV=production
ENV PORT=3030
ENV FFMPEG_LOCATION=/usr/bin/ffmpeg
ENV EXPECTED_NODE_MAJOR=22
ENV EXPECTED_YT_DLP_VERSION=${YT_DLP_VERSION}
ENV EXPECTED_FFMPEG_LOCATION=/usr/bin/ffmpeg
ENV EXPECTED_FFMPEG_VERSION=${EXPECTED_FFMPEG_VERSION}

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates python3 ffmpeg=${FFMPEG_VERSION} && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --chown=node:node --from=build /app/package*.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node scripts ./scripts

USER node

EXPOSE 3030

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "const port = process.env.PORT || 3030; fetch(`http://127.0.0.1:${port}/health`).then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1));"

CMD ["node", "dist/main"]
