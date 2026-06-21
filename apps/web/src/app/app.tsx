import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  type DownloadDraft,
  INITIAL_DOWNLOAD_DRAFT,
  buildDownloadUrl,
  downloadDraftSchema,
  validateDownloadDraft,
} from '../domain/download-request/download-request';

/** Media Nest Vite CSR PWA. */
export function App() {
  // States.

  /** 마지막으로 생성한 다운로드 URL. */
  const [generatedUrl, setGeneratedUrl] = useState('');

  // Hooks.

  /** 다운로드 입력 form 상태. */
  const {
    handleSubmit,
    register,
    setValue,
    watch,
    formState: { isValid },
  } = useForm<DownloadDraft>({
    defaultValues: INITIAL_DOWNLOAD_DRAFT,
    mode: 'onChange',
    resolver: zodResolver(downloadDraftSchema),
  });

  // Computed.

  /** 현재 form 입력값. */
  const draft = watch();
  /** 현재 입력 검증 결과. */
  const validation = validateDownloadDraft(draft);
  /** 다운로드 실행 가능 여부. */
  const canSubmit = validation.kind === 'ready' && isValid;
  /** 품질 입력 라벨. */
  const qualityLabel = draft.mode === 'audio' ? '최대 비트레이트' : '최대 해상도';
  /** 품질 입력 placeholder. */
  const qualityPlaceholder = draft.mode === 'audio' ? '192' : '720';

  // Functions.

  /** 입력 변경 후 생성된 URL을 초기화한다. */
  function clearGeneratedUrl() {
    setGeneratedUrl('');
  }

  /** 생성한 다운로드 URL을 현재 브라우저에서 연다. */
  function openDownloadUrl(downloadUrl: string) {
    window.open(downloadUrl, '_blank', 'noopener,noreferrer');
  }

  // Handlers.

  /** 다운로드 형식 변경 이벤트를 처리한다. */
  function handleModeChange() {
    clearGeneratedUrl();
    setValue('quality', '', {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  /** 다운로드 실행 submit 이벤트를 처리한다. */
  function handleDownloadSubmit(validDraft: DownloadDraft) {
    /** Media Nest API 다운로드 URL. */
    const downloadUrl = buildDownloadUrl(
      validDraft,
      import.meta.env.VITE_MEDIA_NEST_API_BASE_URL,
    );

    setGeneratedUrl(downloadUrl);
    openDownloadUrl(downloadUrl);
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-labelledby="page-title">
        <header className="page-header">
          <h1 id="page-title">Media Nest</h1>
          <p>원본 URL과 옵션을 입력해 Media Nest API 다운로드를 시작합니다.</p>
        </header>

        <form className="download-form" onSubmit={handleSubmit(handleDownloadSubmit)}>
          <label className="field field--wide">
            <span>원본 URL</span>
            <input
              autoComplete="off"
              placeholder="https://www.youtube.com/watch?v=..."
              type="url"
              {...register('sourceUrl', { onChange: clearGeneratedUrl })}
            />
          </label>

          <fieldset className="mode-group">
            <legend>다운로드 형식</legend>
            <label className={draft.mode === 'audio' ? 'mode-option is-selected' : 'mode-option'}>
              <input
                checked={draft.mode === 'audio'}
                type="radio"
                value="audio"
                {...register('mode', { onChange: handleModeChange })}
              />
              <span>오디오</span>
            </label>
            <label className={draft.mode === 'video' ? 'mode-option is-selected' : 'mode-option'}>
              <input
                checked={draft.mode === 'video'}
                type="radio"
                value="video"
                {...register('mode', { onChange: handleModeChange })}
              />
              <span>비디오</span>
            </label>
          </fieldset>

          <label className="field">
            <span>파일명</span>
            <input
              autoComplete="off"
              placeholder="선택 입력"
              type="text"
              {...register('filename', { onChange: clearGeneratedUrl })}
            />
          </label>

          <label className="field">
            <span>{qualityLabel}</span>
            <input
              inputMode="numeric"
              min={1}
              placeholder={qualityPlaceholder}
              step={1}
              type="number"
              {...register('quality', { onChange: clearGeneratedUrl })}
            />
          </label>

          <p className={`status-text status-text--${validation.kind}`} role="status">
            {validation.message}
          </p>

          <button className="primary-button" disabled={!canSubmit} type="submit">
            다운로드 열기
          </button>
        </form>

        {generatedUrl ? (
          <section className="result-section" aria-labelledby="result-title">
            <h2 id="result-title">생성된 URL</h2>
            <a href={generatedUrl} target="_blank" rel="noreferrer">
              {generatedUrl}
            </a>
          </section>
        ) : null}
      </section>
    </main>
  );
}
