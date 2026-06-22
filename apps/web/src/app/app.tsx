import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  type DownloadDraft,
  INITIAL_DOWNLOAD_DRAFT,
  buildDownloadUrl,
  downloadDraftSchema,
  resolveDownloadFilename,
  validateDownloadDraft,
} from '../domain/download-request/download-request';

/** Media Nest Vite CSR PWA. */
export function App() {
  // States.

  /** 다운로드 요청 진행 여부. */
  const [isDownloading, setIsDownloading] = useState(false);
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
  const canSubmit = validation.kind === 'ready' && isValid && !isDownloading;
  /** 품질 입력 라벨. */
  const qualityLabel = draft.mode === 'audio' ? '최대 비트레이트' : '최대 해상도';
  /** 품질 입력 placeholder. */
  const qualityPlaceholder = draft.mode === 'audio' ? '192' : '720';
  /** 사용자에게 표시할 현재 상태 메시지. */
  const statusMessage = isDownloading
    ? '다운로드 파일을 준비하고 있습니다.'
    : downloadMessage || validation.message;
  /** 현재 상태 메시지의 시각적 상태. */
  const statusKind = downloadFailed ? 'invalid' : validation.kind;

  // Functions.

  /** 입력 변경 후 이전 다운로드 결과를 초기화한다. */
  function clearDownloadResult() {
    setDownloadMessage('');
    setDownloadFailed(false);
  }

  /** Blob 응답을 브라우저 다운로드로 전달한다. */
  function saveBlob(blob: Blob, filename: string) {
    /** 브라우저가 다운로드할 임시 object URL. */
    const objectUrl = URL.createObjectURL(blob);
    /** 다운로드를 시작하기 위한 임시 anchor. */
    const downloadLink = document.createElement('a');

    downloadLink.href = objectUrl;
    downloadLink.download = filename;
    downloadLink.click();
    URL.revokeObjectURL(objectUrl);
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
  async function handleDownloadSubmit(validDraft: DownloadDraft) {
    /** Media Nest API 다운로드 URL. */
    const downloadUrl = buildDownloadUrl(
      validDraft,
      import.meta.env.VITE_MEDIA_NEST_API_BASE_URL,
    );

    setIsDownloading(true);
    clearDownloadResult();

    try {
      /** Media Nest API attachment 응답. */
      const response = await fetch(downloadUrl);

      if (!response.ok) {
        throw new Error('다운로드 요청에 실패했습니다. 잠시 후 다시 시도해주세요.');
      }

      /** 브라우저 저장에 사용할 API 응답 파일명. */
      const filename = resolveDownloadFilename(
        validDraft,
        response.headers.get('Content-Disposition'),
      );
      /** 브라우저에서 저장할 media blob. */
      const blob = await response.blob();

      saveBlob(blob, filename);
      setDownloadMessage(`${filename} 다운로드를 시작했습니다.`);
    } catch (error) {
      setDownloadFailed(true);
      setDownloadMessage(
        error instanceof Error
          ? error.message
          : '다운로드 요청에 실패했습니다. 잠시 후 다시 시도해주세요.',
      );
    } finally {
      setIsDownloading(false);
    }
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
              {...register('sourceUrl', { onChange: clearDownloadResult })}
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
              {...register('filename', { onChange: clearDownloadResult })}
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
              {...register('quality', { onChange: clearDownloadResult })}
            />
          </label>

          <p className={`status-text status-text--${statusKind}`} role="status">
            {statusMessage}
          </p>

          <button className="primary-button" disabled={!canSubmit} type="submit">
            {isDownloading ? '다운로드 준비 중' : '다운로드 시작'}
          </button>
        </form>
      </section>
    </main>
  );
}
