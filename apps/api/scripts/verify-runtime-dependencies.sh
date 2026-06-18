#!/usr/bin/env sh

set -eu

fail() {
  printf 'runtime dependency check failed: %s\n' "$1" >&2
  exit 1
}

print_check() {
  printf '%s: %s\n' "$1" "$2"
}

NODE_VERSION="$(node --version 2>/dev/null)" || fail 'node executable is not available'
print_check 'node' "$NODE_VERSION"

if [ -n "${EXPECTED_NODE_MAJOR:-}" ]; then
  case "$NODE_VERSION" in
    "v${EXPECTED_NODE_MAJOR}."*) ;;
    *) fail "expected Node.js major ${EXPECTED_NODE_MAJOR}, got ${NODE_VERSION}" ;;
  esac
fi

YOUTUBE_DL_BIN="${YOUTUBE_DL_BIN:-node_modules/youtube-dl-exec/bin/yt-dlp}"

if [ ! -x "$YOUTUBE_DL_BIN" ]; then
  fail "yt-dlp binary is not executable at ${YOUTUBE_DL_BIN}"
fi

YT_DLP_VERSION="$("$YOUTUBE_DL_BIN" --version)" || fail 'yt-dlp version check failed'
print_check 'yt-dlp' "$YT_DLP_VERSION"

if [ -n "${EXPECTED_YT_DLP_VERSION:-}" ] && [ "$YT_DLP_VERSION" != "$EXPECTED_YT_DLP_VERSION" ]; then
  fail "expected yt-dlp ${EXPECTED_YT_DLP_VERSION}, got ${YT_DLP_VERSION}"
fi

if [ -n "${FFMPEG_LOCATION:-}" ]; then
  FFMPEG_BIN="$FFMPEG_LOCATION"
else
  FFMPEG_BIN="$(command -v ffmpeg 2>/dev/null || true)"
fi

if [ -z "$FFMPEG_BIN" ]; then
  fail 'ffmpeg executable is not available'
fi

if [ ! -x "$FFMPEG_BIN" ]; then
  fail "ffmpeg binary is not executable at ${FFMPEG_BIN}"
fi

if [ -n "${EXPECTED_FFMPEG_LOCATION:-}" ] && [ "$FFMPEG_BIN" != "$EXPECTED_FFMPEG_LOCATION" ]; then
  fail "expected ffmpeg at ${EXPECTED_FFMPEG_LOCATION}, got ${FFMPEG_BIN}"
fi

FFMPEG_VERSION_LINE="$("$FFMPEG_BIN" -version | sed -n '1p')" || fail 'ffmpeg version check failed'
print_check 'ffmpeg' "$FFMPEG_VERSION_LINE"

if [ -n "${EXPECTED_FFMPEG_VERSION:-}" ]; then
  case "$FFMPEG_VERSION_LINE" in
    *" ${EXPECTED_FFMPEG_VERSION}"*) ;;
    *) fail "expected ffmpeg version containing ${EXPECTED_FFMPEG_VERSION}, got ${FFMPEG_VERSION_LINE}" ;;
  esac
fi
