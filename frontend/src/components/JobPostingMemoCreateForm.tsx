import { useState } from "react";
import type { FormEvent } from "react";

import { createJobPostingMemo } from "../api/jobPostingMemoApi";

interface CreateJobPostingMemoProps {
  jobPostingId: number;
}

function JobPostingMemoCreateForm({
  jobPostingId,
}: CreateJobPostingMemoProps) {
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

      setContent(''); //메모 등록 성공 후 입력 칸 초기화

      setMessage('메모가 성공적으로 등록되었습니다')
    } catch (caughtError) {
      const errorMessage = 
        caughtError instanceof Error
          ? caughtError.message
          : '알 수 없는 오류가 발생하였습니다';
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <h3>메모 등록</h3>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="content">메모내용</label>
          <textarea
            id="content"
            value={content}
            maxLength={250}
            onChange={(event) =>
              setContent(event.target.value)
            }
          />
        </div>
        
        <button type="submit" disabled={submitting || content.trim() === ''}>
          {submitting ? '등록 중...' : '등록'}
        </button>
      </form>

      {message && <p>{message}</p>}
      {error && <p>{error}</p>}
    </section>
  )
}

export default JobPostingMemoCreateForm;