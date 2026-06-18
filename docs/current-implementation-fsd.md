# Media Nest 현재 구현 FSD

## 문서 기준

이 문서는 현재 코드 기준으로 제공되는 API 계약을 도메인과 엔드포인트별로 정리한다. 내부 구현 파일을 모두 추적하는 설계 문서가 아니라, API 호출자가 확인해야 하는 요청 파라미터, 응답 방식, 현재 한계와 주의사항을 중심으로 한다.

## 공통 실행 환경

- Runtime: NestJS 10, Node.js 22 기준 Dockerfile
- Media 처리: `youtube-dl-exec`
- 오디오/비디오 병합 및 추출 의존성: ffmpeg
- 기본 포트: `PORT` 환경 변수가 없으면 `3030`
- 환경 파일: `.env.{NODE_ENV}` 형식으로 로드
- 주요 환경 변수:
  - `FFMPEG_LOCATION`: youtube-dl-exec 실행 시 ffmpeg 위치로 전달
  - `EXTENSION_ID`: Chrome 확장 프로그램 origin 구성용 값으로 읽지만, 현재 CORS 제한 로직은 비활성화되어 있음

## Video

### `GET /video`

전달받은 미디어 URL에서 비디오 파일을 생성하고 다운로드 응답을 반환한다.

요청:

| 항목 | 위치 | 필수 | 설명 |
| --- | --- | --- | --- |
| `url` | query | 예 | 다운로드할 미디어 URL |
| `filename` | query | 아니오 | 다운로드 파일명. 없으면 15자 랜덤 문자열을 사용 |
| `resolution` | query | 아니오 | 최대 영상 높이. 예: `720` |

응답:

- `Content-Type`: `video/mp4`
- `Content-Disposition`: attachment 다운로드
- 정상 처리 시 서버가 생성한 비디오 파일을 응답 본문으로 전송
- 실패 시 `500` 상태와 에러 메시지 또는 `Failed generating.` 문자열을 반환할 수 있음

현재 처리 방식:

- `resolution`이 있으면 `bestvideo[height<=resolution]+bestaudio/best` 포맷을 사용한다.
- `resolution`이 없으면 `bestvideo+bestaudio/best` 포맷을 사용한다.
- 실행 중인 모듈 디렉터리 기준 `../downloads` 경로에 임시 파일을 생성하고, 전송 후 다운로드 디렉터리의 파일을 삭제한다.

현재 한계와 주의사항:

- `url` 필수 여부는 타입으로만 표현되어 있고 런타임 검증은 없다.
- `filename`은 응답 파일명에 `.mp4` 확장자를 붙이고, 임시 저장 경로에서는 URL 인코딩된 파일명을 사용한다.
- youtube-dl-exec에는 `mergeOutputFormat: 'mp4'`를 전달한다.
- 동시 요청 시 같은 다운로드 디렉터리의 전체 파일을 삭제하므로 다른 요청의 임시 파일에 영향을 줄 수 있다.

### `GET /video/:id`

YouTube 영상 ID를 받아 watch URL을 구성한 뒤 비디오 파일 다운로드 응답을 반환한다.

요청:

| 항목 | 위치 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | path | 예 | YouTube 영상 ID |
| `filename` | query | 아니오 | 다운로드 파일명. 없으면 15자 랜덤 문자열을 사용 |
| `resolution` | query | 아니오 | 최대 영상 높이. 예: `720` |

응답:

- `GET /video`와 동일하게 비디오 파일 다운로드 응답을 반환한다.

현재 처리 방식:

- `id`를 `https://www.youtube.com/watch?v={id}` 형식의 URL로 변환한다.
- 이후 다운로드 처리는 `GET /video`와 같은 서비스 로직을 사용한다.

현재 한계와 주의사항:

- `id` 형식 검증은 없다.
- YouTube가 아닌 다른 서비스 ID 입력은 지원하지 않는다.
- 파일명 인코딩 처리와 동시 요청 파일 삭제 이슈는 `GET /video`와 동일하다.

## Audio

### `GET /audio`

전달받은 미디어 URL에서 오디오를 추출하고 다운로드 응답을 반환한다.

요청:

| 항목 | 위치 | 필수 | 설명 |
| --- | --- | --- | --- |
| `url` | query | 예 | 오디오를 추출할 미디어 URL |
| `filename` | query | 아니오 | 다운로드 파일명. 없으면 15자 랜덤 문자열을 사용 |
| `bitrate` | query | 아니오 | 최대 오디오 비트레이트. 예: `320` |

응답:

- `Content-Type`: `audio/mpeg`
- `Content-Disposition`: attachment 다운로드
- 정상 처리 시 서버가 생성한 오디오 파일을 응답 본문으로 전송
- 실패 시 `500` 상태와 `Error generating audio file` 문자열을 반환할 수 있음

현재 처리 방식:

- `bitrate`가 있으면 `bestaudio[abr<=bitrate]/best` 포맷을 사용한다.
- `bitrate`가 없으면 `bestaudio/best` 포맷을 사용한다.
- `extractAudio: true`, `audioFormat: 'mp3'` 옵션을 youtube-dl-exec에 전달한다.
- 실행 중인 모듈 디렉터리 기준 `../downloads` 경로에 임시 파일을 생성하고, 응답 전송 후 해당 파일을 삭제한다.

현재 한계와 주의사항:

- `url` 필수 여부는 타입으로만 표현되어 있고 런타임 검증은 없다.
- 오디오 포맷은 mp3로 요청하지만, 현재 임시 파일명과 다운로드 파일명은 `.mp4` 확장자를 사용한다.
- 임시 파일 삭제는 `unlinkSync`에 의존하므로 파일이 없거나 삭제에 실패하면 추가 오류가 발생할 수 있다.
- 실패 사유는 세분화된 에러 코드로 제공되지 않는다.

### `GET /audio/:id`

YouTube 영상 ID를 받아 watch URL을 구성한 뒤 오디오 추출 다운로드 응답을 반환한다.

요청:

| 항목 | 위치 | 필수 | 설명 |
| --- | --- | --- | --- |
| `id` | path | 예 | YouTube 영상 ID |
| `filename` | query | 아니오 | 다운로드 파일명. 없으면 15자 랜덤 문자열을 사용 |
| `bitrate` | query | 아니오 | 최대 오디오 비트레이트. 예: `320` |

응답:

- `GET /audio`와 동일하게 오디오 파일 다운로드 응답을 반환한다.

현재 처리 방식:

- `id`를 `https://www.youtube.com/watch?v={id}` 형식의 URL로 변환한다.
- 이후 다운로드 처리는 `GET /audio`와 같은 서비스 로직을 사용한다.

현재 한계와 주의사항:

- `id` 형식 검증은 없다.
- YouTube가 아닌 다른 서비스 ID 입력은 지원하지 않는다.
- 파일 확장자와 실제 오디오 포맷의 불일치 가능성은 `GET /audio`와 동일하다.

## Health

### `GET /health`

서버 프로세스가 HTTP 요청에 응답 가능한지 확인한다.

요청:

| 항목 | 위치 | 필수 | 설명 |
| --- | --- | --- | --- |
| 없음 | - | - | 별도 파라미터 없음 |

응답:

```json
{
  "ok": true
}
```

현재 처리 방식:

- 고정 객체 `{ ok: true }`를 반환한다.

현재 한계와 주의사항:

- ffmpeg 설치 여부, youtube-dl-exec 실행 가능 여부, 다운로드 디렉터리 쓰기 권한은 확인하지 않는다.
- 실제 다운로드 기능의 정상 동작을 보장하는 readiness/liveness 체크로는 부족하다.
