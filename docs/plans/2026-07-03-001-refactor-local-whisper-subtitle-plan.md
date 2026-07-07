# 로컬 Whisper 기반 영어 SRT 생성 전환 계획

## 목표

- 현재 worker의 OpenAI transcription API 호출을 제거한다.
- Subtitle Edit처럼 로컬 Whisper 계열 엔진으로 영어 SRT를 생성한다.
- 기존 CTA 1 흐름은 유지한다.

```txt
로컬 영상 선택
-> R2 업로드
-> worker가 영상 다운로드
-> ffmpeg 오디오 추출
-> local Whisper로 영어 SRT 생성
-> R2에 SRT 업로드
-> web에서 다운로드
```

## 제외 범위

- 한글 번역 CTA 2 구현 제외
- 자막 편집기 제외
- Whisper 모델 자동 다운로드 제외
- GPU 최적화 제외
- 여러 STT 엔진 추상화 제외

## 현재 문제

현재 worker 흐름:

```txt
video -> ffmpeg -> OpenAI /v1/audio/transcriptions -> english.srt
```

문제:

- `OPENAI_API_KEY`가 필요하다.
- 무료 로컬 처리 의도와 다르다.
- Subtitle Edit 참고 방향과 다르다.

원하는 흐름:

```txt
video -> ffmpeg -> local whisper CLI -> english.srt
```

## 엔진 선택

### 기본안: whisper.cpp

사용 이유:

- 로컬 실행 가능
- API key 불필요
- CLI로 worker에서 붙이기 쉬움
- SRT 출력 지원
- Python runtime 의존도 없음

예상 실행 형태:

```bash
whisper-cli \
  -m /path/to/ggml-medium.en.bin \
  -f /tmp/audio.wav \
  -l en \
  -osrt \
  -of /tmp/english
```

결과:

```txt
/tmp/english.srt
```

### 대안: faster-whisper

보류.

이유:

- Python 환경과 패키지 관리가 추가된다.
- worker Node 런타임에서 붙이려면 wrapper 또는 subprocess 관리가 필요하다.
- 지금 프로토타입 검증에는 과하다.

## 환경 변수

worker `.env`에서 OpenAI 제거.

제거:

```env
OPENAI_API_KEY=
```

추가:

```env
WHISPER_CLI_PATH=/absolute/path/to/whisper-cli
WHISPER_MODEL_PATH=/absolute/path/to/ggml-medium.en.bin
WHISPER_THREADS=4
```

선택:

```env
WHISPER_LANGUAGE=en
```

CTA 1은 영어 SRT만 생성하므로 코드 기본값 `en`으로 두고 env는 없어도 된다.

## 구현 계획

### U1. worker transcription 경로 교체

- 목표:
  - OpenAI API 호출을 local Whisper CLI 실행으로 교체한다.
- 파일:
  - `apps/worker/src/main.ts`
  - `apps/worker/src/worker.logic.ts`
  - `apps/worker/src/worker.logic.spec.ts`
- 접근:
  - OpenAI 호출 부분을 제거한다.
  - `execFile()`로 `WHISPER_CLI_PATH`를 실행한다.
  - 입력 오디오는 기존 ffmpeg 추출 결과를 사용한다.
  - 출력 SRT 파일을 읽어서 R2에 업로드한다.
  - status는 기존 `transcribing`을 유지한다.
- 실패 처리:
  - CLI path 없음: `TRANSCRIPTION_FAILED`
  - model path 없음: `TRANSCRIPTION_FAILED`
  - CLI exit code 실패: `TRANSCRIPTION_FAILED`
  - SRT 파일 없음 또는 빈 파일: `TRANSCRIPTION_FAILED`
- 테스트:
  - Whisper command args 생성 함수 단위 테스트
  - SRT output path 계산 테스트
  - CLI 실패 시 errorCode 매핑 테스트

### U2. ffmpeg 출력 포맷 조정

- 목표:
  - Whisper CLI가 안정적으로 읽을 수 있는 오디오 파일을 생성한다.
- 파일:
  - `apps/worker/src/main.ts`
- 접근:
  - 기존 mp3 추출 대신 wav 출력으로 바꾼다.

```txt
-ac 1 -ar 16000
```

- 예상 출력:

```txt
audio.wav
```

- 이유:
  - Whisper 계열 CLI는 wav 입력이 가장 단순하고 예측 가능하다.
  - mp3 인코딩 설정 고민을 줄인다.
- 테스트:
  - ffmpeg args 생성 함수가 있으면 단위 테스트
  - 없으면 기존 worker logic 테스트에 최소 assertion 추가

### U3. env/example/docs 정리

- 목표:
  - OpenAI API key 요구를 제거하고 로컬 Whisper 준비값을 문서화한다.
- 파일:
  - `apps/worker/.env.example`
  - `docker-compose.env.example`
  - `README.md`
  - `docs/api/current-implementation-fsd.md`
  - `docs/unimplemented/current-unimplemented.md`
- 접근:
  - `OPENAI_API_KEY` 제거
  - `WHISPER_CLI_PATH`, `WHISPER_MODEL_PATH`, `WHISPER_THREADS` 추가
  - "OpenAI transcription" 문구를 "local Whisper transcription"으로 변경
  - 모델 자동 다운로드는 미구현 항목으로 남김
- 테스트:

```bash
rg "OPENAI|audio/transcriptions|WHISPER" README.md docs apps
```

### U4. worker runtime 검증

- 목표:
  - worker가 local Whisper 설정을 읽고 heartbeat를 유지하는지 확인한다.
- 접근:
  - migration/DB는 기존 `SubtitleJob` 그대로 사용한다.
  - worker 실행:

```bash
pnpm worker:dev
```

  - health 확인:

```bash
curl http://127.0.0.1:3030/health
```

- 기대:

```json
{"ok":true,"worker":{"available":true}}
```

- 테스트:
  - `WHISPER_CLI_PATH` 누락 시 worker가 죽지 않고 job 실패로 처리하는지 확인한다.

### U5. 실제 샘플 영상 검증

- 목표:
  - CTA 1 결과 품질 확인.
- 접근:
  - 짧은 영어 영상 파일 선택
  - `영어 SRT 생성`
  - 완료 후 SRT 다운로드
  - Subtitle Edit 또는 플레이어에서 타이밍/문장 품질 확인
- 확인 항목:
  - SRT 파일 생성 여부
  - timestamp 형식 정상 여부
  - 영어 인식 품질
  - 긴 영상 처리 시간
  - worker 실패 시 UI 메시지

## DB/API/UI 영향

### DB

변경 없음.

기존 `SubtitleJob` 그대로 사용.

```txt
queued
extracting_audio
transcribing
completed
failed
```

### API

변경 거의 없음.

- upload API 유지
- polling API 유지
- download API 유지

### Web UI

변경 없음.

CTA 1 관점에서 사용자는 engine이 OpenAI인지 local Whisper인지 알 필요가 없다.

## 리스크

| 리스크 | 설명 | 대응 |
|---|---|---|
| 모델 파일 없음 | `WHISPER_MODEL_PATH`가 틀리면 실패 | job failed 처리 |
| 처리 속도 느림 | CPU only면 긴 영상이 오래 걸림 | 프로토타입에서는 허용 |
| SRT 품질 편차 | 모델 크기에 따라 품질 차이 | `medium.en` 이상 추천 |
| worker 배포 어려움 | 서버에 whisper binary/model 필요 | 로컬 프로토타입 먼저 |
| 파일 경로 이슈 | CLI 출력 파일명이 예상과 다를 수 있음 | output path 고정 |

## 추천 기본값

```env
WHISPER_THREADS=4
```

모델 추천:

```txt
ggml-small.en.bin   빠름, 품질 보통
ggml-medium.en.bin  느림, 품질 좋음
```

프로토타입 품질 확인은 `medium.en` 추천.

## 구현 순서

1. OpenAI transcription 코드 위치 확인
2. Whisper CLI command 생성 함수 추가
3. worker transcription 실행부 교체
4. env/example/docs에서 OpenAI 제거
5. 단위 테스트 수정
6. `pnpm --filter worker run lint`
7. `pnpm worker:dev`
8. 샘플 영상으로 실제 SRT 확인

## 구현 전 확인 필요

1. 로컬에 사용할 Whisper 엔진은 `whisper.cpp`로 고정할지?
2. `whisper-cli` binary와 `.bin` 모델 파일은 사용자가 직접 준비하는 방식으로 둘지?
3. 품질 확인용 기본 모델은 `medium.en`으로 안내할지?
