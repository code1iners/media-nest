import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/** 운영 web app origin. */
export const PRODUCTION_WEB_ORIGIN = 'https://mytube-extract.codeliners.cc';

/** 이전 운영 web app origin. */
const LEGACY_PRODUCTION_WEB_ORIGIN = 'https://mytube-extract-web.codeliners.cc';

/** Browser client가 읽어야 하는 media response header. */
const EXPOSED_MEDIA_HEADERS = ['Content-Disposition', 'Content-Type'] as const;

/** Local preview와 Vite dev server origin. */
const LOCAL_WEB_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5010',
  'http://127.0.0.1:5010',
];

/** CORS 정책 생성 입력값. */
type CorsPolicyOptions = {
  /** 실행 환경. production이면 local origin을 제외한다. */
  nodeEnv?: string;
};

/** 실행 환경별 허용 origin 목록을 만든다. */
function createAllowedOrigins(options: CorsPolicyOptions = {}) {
  /** 현재 실행 환경. */
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
  /** 운영에서도 항상 허용할 origin 목록. */
  const allowedOrigins = [PRODUCTION_WEB_ORIGIN, LEGACY_PRODUCTION_WEB_ORIGIN];

  if (nodeEnv !== 'production') {
    allowedOrigins.push(...LOCAL_WEB_ORIGINS);
  }

  return allowedOrigins;
}

/** 요청 origin이 현재 CORS 정책에서 허용되는지 확인한다. */
export function isCorsOriginAllowed(
  origin: string | undefined,
  options: CorsPolicyOptions = {},
) {
  if (!origin) {
    return true;
  }

  return createAllowedOrigins(options).includes(origin);
}

/** Nest bootstrap에서 사용하는 CORS option을 만든다. */
export function createCorsOptions(
  options: CorsPolicyOptions = {},
): CorsOptions {
  /** CORS origin callback에서 참조할 허용 origin 목록. */
  const allowedOrigins = createAllowedOrigins(options);

  return {
    exposedHeaders: [...EXPOSED_MEDIA_HEADERS],
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
  };
}
