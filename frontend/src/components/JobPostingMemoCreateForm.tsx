import { useState, useEffect } from "react";
import type { FormEvent } from "react";

import { createJobPostingMemo } from "../api/jobPostingMemoApi";
import { errorMessageOf } from "../api/apiError";

interface CreateJobPostingMemoProps {
  onCreated: () => Promise<void> | void;
  jobPostingId: number;
}

function JobPostingMemoCreateForm({
  onCreated,
  jobPostingId,
}: CreateJobPostingMemoProps) {
  const contentId = `memo-content-${jobPostingId}`;
  const [content, setContent] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      setContent(''); // メモ登録の成功後に入力欄を初期化する

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
      <h3>メモ登録</h3>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor={contentId}>メモ内容</label>
          <textarea
            id={contentId}
            value={content}
            maxLength={250}
            onChange={(event) =>
              setContent(event.target.value)
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