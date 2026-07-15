# MyTube Extract Design System

## 1. 목적과 범위

MyTube Extract의 Web과 Chrome 확장 popup에 공통 적용하는 Foundation이다.

범위는 color, typography, spacing, radius, elevation, theme·mode, 접근성, 플랫폼 mapping이다. 컴포넌트 API, token 코드 생성, Figma, 실제 UI 구현은 포함하지 않는다.

## 2. 브랜드 입력과 디자인 원칙

- 픽셀 콘솔의 단단하고 장난기 있는 인상을 유지한다.
- primary는 deep violet이며, primary 행동은 하나의 화면에서 경쟁하지 않는다.
- teal은 진행·focus·보조 행동, amber는 완료·보상 강조에만 사용한다.
- 색은 장식이 아니라 행동·상태·계층을 구분하는 수단이다.
- URL·오류·정책을 포함한 모든 UI 텍스트는 `LanaPixel`을 사용한다.

## 3. 대상 플랫폼과 공통 규칙

- 대상: Vite Web, Chrome MV3 popup.
- 공통 단위: CSS `px`.
- 공통 token 의미를 먼저 정의하고, 플랫폼 구현은 semantic token을 참조한다.
- 첫 방문 theme는 OS 설정을 따른다. 사용자가 바꾸면 선택을 유지한다.

## 4. Token 구조와 명명 원칙

두 계층을 사용한다.

- Primitive: `purple-700`, `teal-700`, `neutral-light-canvas`처럼 값 자체를 나타낸다.
- Semantic: `color-action-primary`, `color-surface-default`, `color-text-primary`처럼 UI 역할을 나타낸다.

화면·컴포넌트는 semantic token만 사용한다. primitive를 직접 참조하지 않는다.

## 5. Color

### Primitive

| Family | Light / Dark에 쓰는 값 |
| --- | --- |
| Purple | `#2E1065`, `#4C1D95`, `#6D28D9`, `#7C3AED`, `#A78BFA`, `#C4B5FD` |
| Teal | `#042F2E`, `#0F766E`, `#5EEAD4` |
| Amber | `#451A03`, `#B45309`, `#FCD34D` |
| Info | `#1D4ED8`, `#93C5FD` |
| Success | `#15803D`, `#86EFAC` |
| Error | `#B91C1C`, `#FCA5A5` |

### Semantic

| 역할 | Light | Dark |
| --- | --- | --- |
| Canvas | `#FAF8FF` | `#110C1C` |
| Surface / raised | `#FFFFFF` / `#F3EFFF` | `#1B1329` / `#251A38` |
| Text primary / secondary | `#201A2B` / `#544D61` | `#F7F2FF` / `#C9C1D8` |
| Border | `#79747E` | `#948DA0` |
| Primary / on-primary | `#6D28D9` / `#FFFFFF` | `#C4B5FD` / `#2E1065` |
| Secondary / on-secondary | `#0F766E` / `#FFFFFF` | `#5EEAD4` / `#042F2E` |
| Tertiary / on-tertiary | `#B45309` / `#FFFFFF` | `#FCD34D` / `#451A03` |

status는 info·success·error semantic 역할로만 사용한다. 색만으로 상태를 전달하지 않는다.

## 6. Typography

- Font family: `LanaPixel`, system sans-serif fallback.
- 실제 font asset은 Regular 1종이다. weight가 아닌 size·색·공간으로 계층을 만든다.
- 권장 scale: `12, 14, 16, 20, 28, 42px`.
- 기본 line-height: 본문 `1.5`, 짧은 label·button `1.2`.
- `LanaPixel`은 한글 glyph를 포함한다.
- 사용자 text scaling 200%에서도 내용·기능이 사라지지 않아야 한다.

## 7. Spacing

공통 scale은 `4, 8, 12, 16, 24, 32px`다. 임의의 중간값을 추가하지 않는다.

## 8. Radius

- 일반 container·input·button: `4px`
- 작은 내부 pixel detail: `2px`
- 그보다 큰 radius는 사용하지 않는다.

## 9. Elevation

- Flat: `0`
- Raised: `0 3px 0`
- Floating: `0 5px 0`과 약한 blur

일반 UI는 flat·raised만 사용한다. modal, toast, dropdown, alert만 floating을 사용한다.

## 10. Theme과 Mode

- light와 dark를 모두 제공한다.
- 최초 theme는 OS preference를 따른다.
- 사용자가 선택한 theme는 이후에도 유지한다.
- theme 전환은 semantic token의 값만 바꾸며, 구조·spacing·radius·elevation은 바꾸지 않는다.

## 11. 접근성

- 일반 텍스트는 최소 `4.5:1`, 큰 텍스트는 최소 `3:1` 대비를 충족한다.
- UI 경계·focus indicator는 인접 색상과 최소 `3:1` 대비를 충족한다.
- 상태는 색과 함께 텍스트·아이콘으로 전달한다.
- keyboard focus는 teal secondary outline으로 명확히 표시한다.
- 200% text resize와 키보드 조작을 Web·popup 모두에서 검증한다.

## 12. 플랫폼 Mapping

- Web과 Chrome popup은 CSS `px`와 같은 semantic token 의미를 사용한다.
- Web은 responsive viewport와 browser zoom을 지원한다.
- popup은 현재 360px 폭 제약 안에서 같은 spacing·type·color 규칙을 축소 적용한다.
- iOS·Android·desktop native mapping은 현재 대상이 아니므로 정의하지 않는다.

## 현재 상태와 목표 상태

| 항목 | 현재 | 목표 |
| --- | --- | --- |
| Color | navy·gold 중심, 플랫폼별 hex 상이 | violet·teal·amber 공통 semantic token |
| Theme | dark-only | light/dark, OS 기본·사용자 선택 유지 |
| Typography | Web LanaPixel, extension Inter | 양쪽 모두 LanaPixel |
| Spacing / radius | 3~4px, 비정형 gap | 승인된 scale과 2/4px radius |
| Elevation | 하단 shadow 사용 | flat·raised·floating 역할 분리 |

## 열린 결정

- `LanaPixel`의 라이선스·Chrome 확장 배포 포함 조건
- theme 선택 저장의 구체적 구현 방식
- logo wordmark와 안전 여백

## 조사 출처

- MyTube Extract 브랜드 문서 및 현재 구현, 확인일: 2026-07-15
- [WCAG 2.2 Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), 확인일: 2026-07-15
- [WCAG 2.2 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html), 확인일: 2026-07-15
- [MDN `prefers-color-scheme`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme), 확인일: 2026-07-15
