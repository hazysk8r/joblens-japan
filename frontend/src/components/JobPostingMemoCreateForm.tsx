import { useState, useEffect } from "react";
import type { FormEvent } from "react";

import { createJobPostingMemo } from "../api/jobPostingMemoApi";
import { errorMessageOf } from "../api/apiError";
import { readMemoDraft, writeMemoDraft } from "../utils/memoDraftStorage";

interface CreateJobPostingMemoProps {
  onCreated: () => Promise<void> | void;
  jobPostingId: number;
  draftKey: string;
}

function JobPostingMemoCreateForm({
  onCreated,
  jobPostingId,
  draftKey,
}: CreateJobPostingMemoProps) {
  const contentId = `memo-content-${jobPostingId}`;
  const [content, setContent] = useState(() => readMemoDraft(draftKey));

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 画面の入力と一時保存を、必ず一緒に更新する。
  const updateContent = (nextContent: string) => {
    setContent(nextContent);
    writeMemoDraft(draftKey, nextContent);
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      await createJobPostingMemo(jobPostingId, {
        content,
      });

      updateContent(''); // メモ登録の成功後に入力欄を初期化する

      setMessage('メモを登録しました。')
      await onCreated();
    } catch (caughtError) {
      setError(errorMessageOf(
        caughtError,
        'content',
        '不明なエラーが発生しました。',
      ));
    } finally {
      setSubmitting(false);
    }
  };

  // メモ成功メッセージのタイマー
  useEffect(() => {
    if (message === null) {
      return;
    }

    const timerId = setTimeout(() => {
      setMessage(null);
    }, 3000);

    return () => {
      clearTimeout(timerId);
    };
  }, [message]);

  return (
    <section>
      <h4>メモ登録</h4>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor={contentId}>メモ内容</label>
          <textarea
            id={contentId}
            value={content}
            maxLength={250}
            onChange={(event) =>
              updateContent(event.target.value)
            }
          />
          <small>{content.length} / 250</small>
        </div>
        
        <button type="submit" disabled={submitting || content.trim() === ''}>
          {submitting ? '登録中…' : '登録'}
        </button>
      </form>

      <p role="status">{message}</p>
      {error && <p role="alert">{error}</p>}
    </section>
  )
}

export default JobPostingMemoCreateForm;