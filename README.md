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

# production mode
$ npm run start:prod
```

## Usage

### Docker

#### 1. Build with `Dockerfile`

```shell
docker build -t media-nest:latest .
```

#### 2. Run Application.

```shell
docker run --env-file .env -d -p 3030:3030 media-nest
```

#### 3. Check server.

```shell
curl http://localhost:3030/health # {"ok":true}
```

#### 4. Request video or audio.

```shell
# Enter your browser to download video with best quality.
http://localhost:3030/video/[VIDEO_ID]

# Enter your browser to download video with Specific options.
http://localhost:3030/video/[VIDEO_ID]?filename=something&resolution=720

# Enter your browser to download audio with best quality.
http://localhost:3030/audio/[AUDIO_ID]

# Enter your browser to download audio with specific options.
http://localhost:3030/audio/[AUDIO_ID]?filename=[SOMETHING]&bitrate=320
```
