# MyTube Extract Docs

이 디렉터리는 현재 구현 기준 source of truth 문서를 둔다. 계획 문서와 과거 작업 노트는 현재 구현 계약이 아니다.

## Source Of Truth

- API endpoint 계약: `docs/server/endpoints/*`
- Web route 계약: `docs/web/routes/*`
- Web 앱 개요: `docs/web/current-implementation-prd.md`, `docs/web/current-implementation-fsd.md`
- API 제품/구조 개요: `docs/api/current-implementation-prd.md`, `docs/api/current-implementation-fsd.md`
- Chrome 확장 프로그램 개요: `docs/chrome-extension/current-implementation-prd.md`, `docs/chrome-extension/current-implementation-fsd.md`
- 공통 브랜드 가이드라인: `docs/brand-guidelines.md`
- 공통 디자인 시스템 Foundation: `docs/DESIGN.md`
- Chrome 확장 프로그램 브랜딩 적용: `docs/chrome-extension/branding-direction.md`
- 호환용 자막 업로드 제거 조건: `docs/deprecated/subtitle-legacy-multipart-upload.md`
- 미구현 과제: `docs/unimplemented/current-unimplemented.md`

## 규칙

- README는 실행 방법과 문서 지도를 담당하고 상세 계약을 중복하지 않는다.
- 서버 계약은 endpoint별 문서를 우선한다.
- Web 계약은 route별 문서를 우선한다.
- 미구현 과제는 `docs/unimplemented/current-unimplemented.md` 한 곳에 둔다.
- 구현 완료된 계획 문서는 남기지 않는다. 남은 과제만 `docs/unimplemented/current-unimplemented.md`로 옮긴다.
