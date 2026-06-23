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

/** MyTube Extract Vite CSR web app. */
export function App() {
  // States.

  /** 다운로드 요청 결과 메시지. */
  const [downloadMessage, setDownloadMessage] = useState('');
  /** 다운로드 요청 실패 여부. */
  const [downloadFailed, setDownloadFailed] = useState(false);

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
  /** 사용자에게 표시할 현재 상태 메시지. */
  const statusMessage = downloadMessage || validation.message;
  /** 현재 상태 메시지의 시각적 상태. */
  const statusTone =
    downloadFailed || validation.kind === 'invalid'
      ? 'danger'
      : validation.kind === 'ready'
        ? 'success'
        : 'warning';
  /** 현재 상태를 짧게 보여주는 브랜드식 label. */
  const statusLabel = downloadFailed
    ? 'ERROR'
    : downloadMessage
      ? 'LOOT'
      : validation.kind === 'ready'
        ? 'READY'
        : validation.kind === 'invalid'
          ? 'CHECK'
          : 'INPUT';

  // Functions.

  /** 입력 변경 후 이전 다운로드 결과를 초기화한다. */
  function clearDownloadResult() {
    setDownloadMessage('');
    setDownloadFailed(false);
  }

  /** API attachment URL을 브라우저 다운로드 매니저로 넘긴다. */
  function startBrowserDownload(downloadUrl: string) {
    /** 다운로드를 시작하기 위한 임시 anchor. */
    const downloadLink = document.createElement('a');

    downloadLink.href = downloadUrl;
    downloadLink.rel = 'noopener';
    downloadLink.target = '_blank';
    downloadLink.click();
  }

  // Handlers.

  /** 다운로드 형식 변경 이벤트를 처리한다. */
  function handleModeChange() {
    clearDownloadResult();
    setValue('quality', '', {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  /** 다운로드 실행 submit 이벤트를 처리한다. */
  function handleDownloadSubmit(validDraft: DownloadDraft) {
    clearDownloadResult();

    try {
      /** MyTube Extract API 다운로드 URL. */
      const downloadUrl = buildDownloadUrl(
        validDraft,
        import.meta.env.VITE_MYTUBE_EXTRACT_API_BASE_URL ??
          import.meta.env.VITE_MEDIA_NEST_API_BASE_URL,
      );

      startBrowserDownload(downloadUrl);
      setDownloadMessage('브라우저 다운로드를 시작했습니다.');
    } catch {
      setDownloadFailed(true);
      setDownloadMessage('다운로드 요청에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace" aria-labelledby="page-title">
        <header className="loot-banner">
          <div className="brand-lockup">
            <p className="brand-kicker">16-bit media extractor</p>
            <h1 id="page-title" className="page-title">
              MyTube Extract
            </h1>
            <p className="hero-copy">이 영상은 이제 제 겁니다</p>
          </div>
          <div className="pixel-extractor" aria-hidden="true">
            <span className="pixel pixel--arm" />
            <span className="pixel pixel--claw" />
            <span className="pixel pixel--capsule" />
          </div>
        </header>

        <p className="policy-strip">저작권 및 플랫폼 정책을 준수해 사용하세요.</p>

        <section className={`status-card status-card--${statusTone}`} aria-labelledby="status-title">
          <p id="status-title" className="status-label">
            {statusLabel}
          </p>
          <p className="status-text" role="status">
            {statusMessage}
          </p>
        </section>

        <form className="download-form" onSubmit={handleSubmit(handleDownloadSubmit)}>
          <label className="field field--wide">
            <span className="field-label">추출 URL</span>
            <span className="field-description">YouTube watch, Shorts, youtu.be URL을 붙여넣으세요.</span>
            <input
              autoComplete="off"
              placeholder="https://www.youtube.com/watch?v=..."
              type="url"
              {...register('sourceUrl', { onChange: clearDownloadResult })}
            />
          </label>

          <fieldset className="mode-group">
            <legend>추출 형식</legend>
            <label className={draft.mode === 'audio' ? 'mode-option is-selected' : 'mode-option'}>
              <input
                checked={draft.mode === 'audio'}
                type="radio"
                value="audio"
                {...register('mode', { onChange: handleModeChange })}
              />
              <span aria-hidden="true">♪</span>
              오디오
            </label>
            <label className={draft.mode === 'video' ? 'mode-option is-selected' : 'mode-option'}>
              <input
                checked={draft.mode === 'video'}
                type="radio"
                value="video"
                {...register('mode', { onChange: handleModeChange })}
              />
              <span aria-hidden="true">▣</span>
              비디오
            </label>
          </fieldset>

          <label className="field">
            <span className="field-label">파일명</span>
            <span className="field-description">비워두면 서버 기본값을 사용합니다.</span>
            <input
              autoComplete="off"
              placeholder="선택 입력"
              type="text"
              {...register('filename', { onChange: clearDownloadResult })}
            />
          </label>

          <label className="field">
            <span className="field-label">{qualityLabel}</span>
            <span className="field-description">비워두면 서버가 기본 품질을 고릅니다.</span>
            <input
              inputMode="numeric"
              min={1}
              placeholder={qualityPlaceholder}
              step={1}
              type="number"
              {...register('quality', { onChange: clearDownloadResult })}
            />
          </label>

          <button className="primary-button" disabled={!canSubmit} type="submit">
            추출 시작
          </button>
        </form>
      </section>
    </main>
  );
}
