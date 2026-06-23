import { buildHealthUrl } from './download-url';

/** fetch 호환 함수. */
export type FetchLike = typeof fetch;

/** MyTube Extract API client 의존성. */
export type MyTubeExtractClientDependencies = {
  /** HTTP 요청 실행 함수. */
  fetch?: FetchLike;
};

/** MyTube Extract API client. */
export type MyTubeExtractClient = {
  /** API server health를 확인한다. */
  assertServerAvailable(apiBaseUrl: string): Promise<void>;
};

/** MyTube Extract API client를 만든다. */
export function createMyTubeExtractClient(
  dependencies: MyTubeExtractClientDependencies = {},
): MyTubeExtractClient {
  /** HTTP 요청 실행 함수. */
  const fetchImplementation = dependencies.fetch ?? fetch;

  return {
    async assertServerAvailable(apiBaseUrl: string) {
      /** API 서버 health check 응답. */
      let response: Response;

      try {
        response = await fetchImplementation(buildHealthUrl(apiBaseUrl));
      } catch {
        throw new Error('Server is unavailable.');
      }

      if (!response.ok) {
        throw new Error('Server is unavailable.');
      }

      /** API 서버 health payload. */
      const payload = (await response.json()) as { ok?: boolean };

      if (payload?.ok !== true) {
        throw new Error('Server health check failed.');
      }
    },
  };
}
