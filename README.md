<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

<p align="center">A simple media(video/audio) application.</p>

## Installation

```bash
$ npm install
```

## Running the app

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev
```

## Another usage

### Docker (Background)

#### 1. Build with `Dockerfile`

```bash
docker build -t media-nest:latest .
```

#### 2. Run Application.

```bash
docker run --env-file .env.production -d -p 3030:3030 media-nest
```

#### 3. Check server.

```bash
curl http://localhost:3030/health # {"ok":true}
```

#### 4. Request video or audio.

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

#### 5. Stop Application.

```bash
# Show your services.
docker ps
# CONTAINER_ID, IMAGE, COMMAND, CREATED, STATUS, PORTS, NAMES
# 143065e2eb6a, media-nest, "docker-entrypoint.s…", 5 seconds ago, Up 5 seconds, 0.0.0.0:3030->3030/tcp, friendly_ritchie

# Stop media nest application.
docker stop [CONTAINER_ID] # CONTAINER_ID = 143065e2eb6a
```

## Errors

### FFMPEG Issue

If you had got some errors, maybe you can need to install `ffmpeg` program on your machine.

#### macOS

```bash
# With homebrew (If you had `homebrew` already)
brew install ffmpeg
```

#### Windows

```bash
# With chocolatey (If you had `chocolatey` already)
choco install ffmpeg
```
