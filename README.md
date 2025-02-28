<p align="center">
  <img width="422" alt="스크린샷 2024-12-16 12 39 56" src="https://github.com/user-attachments/assets/ff5d6162-1fbb-4426-b915-fabf7bf061ae" />
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

<p align="center">A simple media(video/audio) application.</p>

# Usage

## 1. Use `NodeJS`

```bash
# Installation.
$ npm install

# production mode.
$ npm run start:prod

# watch mode.
$ npm run start:dev
```

## 2 Use `Docker` (on Background)

### 2.1. Build with `Dockerfile`

```bash
docker build -t media-nest:latest .
```

### 2.2. Run Application.

```bash
docker run --env-file .env.production -d -p 3030:3030 media-nest
```

### 2.3. Check server.

```bash
curl http://localhost:3030/health # {"ok":true}
```

### 2.4. Request video or audio.

```bash
# Enter your browser to download video with best quality.
http://localhost:3030/video/[VIDEO_ID]

# Enter your browser to download video with Specific options.
http://localhost:3030/video/[VIDEO_ID]?filename=something&resolution=720

# Enter your browser to download audio with best quality.
http://localhost:3030/audio/[AUDIO_ID]

# Enter your browser to download audio with specific options.
http://localhost:3030/audio/[AUDIO_ID]?filename=[SOMETHING]&bitrate=320
```

### 2.5. Stop Application.

```bash
# Show your services.
docker ps
# CONTAINER_ID, IMAGE, COMMAND, CREATED, STATUS, PORTS, NAMES
# 143065e2eb6a, media-nest, "docker-entrypoint.s…", 5 seconds ago, Up 5 seconds, 0.0.0.0:3030->3030/tcp, friendly_ritchie

# Stop media nest application.
docker stop [CONTAINER_ID] # CONTAINER_ID = 143065e2eb6a
```

# Expose my server (use `localtunnel`)

```bash
# Install globally by nodejs.
npm i -g localtunnel

# Expose my server on background.
nohup lt --port 3030 --subdomain codia-api --print-requests > lt.log 2>&1 &

# Stop tunnel.
ps aux | grep codia-api

# Find lt(localtunnel) service like below.
# [USER_NAME], 26897, 0.0, 0.1, 422629376, 56640, s001, SN, 12:17PM, 0:00.37, node, /Users/[USER_NAME]/.nvm/versions/node/v20.13.1/bin/lt --port 3030 --subdomain codia-api --print-requests

# Kill localtunnel service.
kill 26897
```

# Client service

You can also use this service by chrome extension. If you are interested, check [this](<[https;//](https://github.com/code1iners/media-chrome-extension)>) out.

## Caution

If you want to use client service(extension). You have to add Environment variable(EXTENSION_ID) into .env.production file.
You can get extension `ID` on your [Extension program management](chrome://extensions/)(chrome://extensions/)

# Issues

## FFMPEG Issue

If you had got some errors, maybe you can need to install `ffmpeg` program on your machine.

### macOS

```bash
# With homebrew (If you had `homebrew` already)
brew install ffmpeg
```

### Windows

```bash
# With chocolatey (If you had `chocolatey` already)
choco install ffmpeg
```
