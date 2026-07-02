# MyTube Extract Web 현재 구현 PRD

## 목적

MyTube Extract web 앱은 사용자가 브라우저에서 YouTube URL을 입력해 다운로드 job을 만들고, 준비 상태를 확인한 뒤 완료된 파일을 받을 수 있게 하는 Vite CSR 화면이다.

## 대상 사용자

- YouTube URL로 오디오 또는 비디오 파일을 준비하려는 사용자
- 직접 API endpoint를 호출하지 않고 job 상태를 보며 기다리고 싶은 사용자
- 운영 API와 로컬 API 동작을 브라우저에서 확인하려는 개발자

## 핵심 가치

- YouTube watch, Shorts, `youtu.be` URL을 입력해 추출 요청을 보낼 수 있다.
- 오디오와 비디오 모드를 선택할 수 있다.
- 오디오 `128`/`192`/`320`, 비디오 `360`/`720`/`1080` 품질을 선택할 수 있으며 기본값은 오디오 `320`, 비디오 `1080`이다.
- `/downloads` job 상태를 polling해 `queued`, `processing`, `completed`, `failed`, `expired` 상태를 보여준다.
- `/health` worker 상태를 확인해 worker 미가용 시 추출 요청을 막고 서비스 미가용 안내를 보여준다.
- `/health` 상태 확인 문제나 화면 오류가 발생해도 빈 화면 대신 사용자 안내와 상세 원인 보기를 제공한다.
- 완료된 job은 API의 `downloadUrl`을 절대 URL로 변환해 다운로드 링크를 제공한다.
- 다운로드 파일명은 API의 `Content-Disposition` attachment 파일명을 따른다.

## 현재 제공 범위

- 단일 Vite CSR 화면
- React Hook Form + Zod 기반 URL, 모드, 품질 검증
- `/downloads` job 생성
- terminal 상태까지 `/downloads/:jobId` polling
- `/health` worker 상태 확인과 미가용 상태 안내
- 서비스 상태 오류와 화면 오류에 대한 사용자 안내, 상세 원인 보기
- 완료 파일 다운로드 링크 표시
- API attachment 파일명 기반 다운로드
- PWA manifest와 icon build 검증

## 현재 한계

- 사용자 계정과 작업 이력은 없다.
- `filename` 입력은 제공하지 않는다.
- polling 간격은 2500ms 고정이다.
- 세부 진행률은 API 상태 기반 값만 표시한다.
- API base URL은 환경 변수로만 정하고 화면에서 바꾸지 않는다.
- 상세 원인 보기는 운영자 디버깅 보조용이며 외부 오류 수집 서비스는 없다.
