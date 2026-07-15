# Chrome 확장 프로그램 브랜딩 적용 규칙

공통 브랜드 결정은 [MyTube Extract 브랜드 가이드라인](../brand-guidelines.md)을 기준으로 한다. 이 문서는 Chrome 확장 popup과 툴바 아이콘에만 적용되는 규칙을 둔다.

## Popup

Popup은 작은 화면에서도 URL 입력과 실행 행동이 먼저 읽혀야 한다.

1. 제품명 `MyTube Extract`
2. 보조 설명 `16-bit media extractor`
3. 밈 카피 `이 영상은 이제 제 겁니다`
4. 정책 안내 `저작권 및 플랫폼 정책을 준수해 사용하세요.`
5. 추출 URL, 추출 형식, 파일명, 세부 옵션
6. `추출 시작` 버튼

상단 배너는 픽셀 콘솔의 발견감을 담당한다. 입력·설정·오류 상태는 밈 톤 없이 현재 상태와 필요한 행동을 정확히 설명한다.

## 아이콘

- 원본 자산은 `apps/chrome-extension/assets/icon-source.svg`다.
- Chrome 툴바의 작은 크기에서도 픽셀 추출기 실루엣이 읽혀야 한다.
- 출력 아이콘은 원본 SVG에서 생성하며, 별도의 유사 아이콘을 추가하지 않는다.
- YouTube 로고, 공식 재생 버튼, 공식 색 조합을 직접 연상시키는 형태를 사용하지 않는다.

## 적용 범위

- `apps/chrome-extension` popup UI의 제품명, 카피, 라벨, 버튼 문구
- `wxt.config.ts`의 extension name과 description
- popup HTML title
- Chrome extension icon asset
- popup CSS의 색상, 테두리, 버튼, 입력창 스타일

## 검증 기준

- popup 첫 화면에서 `MyTube Extract`와 `이 영상은 이제 제 겁니다`가 명확히 보인다.
- 정책 안내 문구가 다운로드 실행 전에 노출된다.
- 픽셀 스타일을 적용해도 입력값과 버튼 텍스트의 가독성이 유지된다.
- 툴바 아이콘이 작은 크기에서도 추출 도구로 인식된다.
- YouTube 공식 제품 또는 제휴 서비스처럼 보이지 않는다.
