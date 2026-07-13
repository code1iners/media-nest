ARG NODE_IMAGE=node:22.22.3-bookworm-slim
ARG YT_DLP_VERSION=2026.06.09
ARG YOUTUBE_DL_HOST=https://api.github.com/repos/yt-dlp/yt-dlp/releases/tags/${YT_DLP_VERSION}
ARG FFMPEG_VERSION=7:5.1.8-0+deb12u1
ARG EXPECTED_FFMPEG_VERSION=5.1.8

FROM ${NODE_IMAGE} AS build

ENV COREPACK_HOME=/usr/local/share/corepack

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p ${COREPACK_HOME} && \
    corepack enable && \
    corepack prepare pnpm@11.0.8 --activate && \
    chmod -R a+rX ${COREPACK_HOME}

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/chrome-extension/package.json ./apps/chrome-extension/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/media-downloader/package.json ./packages/media-downloader/package.json
ARG YOUTUBE_DL_HOST
RUN YOUTUBE_DL_HOST=${YOUTUBE_DL_HOST} pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN YOUTUBE_DL_HOST=${YOUTUBE_DL_HOST} pnpm rebuild --pending
RUN pnpm --filter @mytube-extract/db run build
RUN pnpm --filter @mytube-extract/media-downloader run build
RUN pnpm --filter api run build
RUN pnpm --filter api deploy --prod --legacy /prod/api

FROM ${NODE_IMAGE} AS production

ENV COREPACK_HOME=/usr/local/share/corepack

ARG YT_DLP_VERSION
ARG FFMPEG_VERSION
ARG EXPECTED_FFMPEG_VERSION

ENV NODE_ENV=production
ENV PORT=5011
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

RUN mkdir -p ${COREPACK_HOME} && \
    corepack enable && \
    corepack prepare pnpm@11.0.8 --activate && \
    chmod -R a+rX ${COREPACK_HOME}

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node --from=build /prod/api ./apps/api

USER node

EXPOSE 5011

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["node", "-e", "const port = process.env.PORT || 5011; fetch('http://127.0.0.1:' + port + '/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1));"]

CMD ["node", "apps/api/dist/main"]
