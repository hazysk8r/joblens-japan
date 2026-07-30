import { useState } from 'react';
import type { FormEvent } from 'react';

import { createJobPosting } from '../api/jobPostingApi';

interface JobPostingCreateFormProps {
  /**
   * 등록 성공 후 부모 컴포넌트의 목록을
   * 다시 불러오기 위해 호출한다.
   */
  onCreated: () => Promise<void> | void;
}

function JobPostingCreateForm({
  onCreated,
}: JobPostingCreateFormProps) {
  const [companyName, setCompanyName] = useState('');
  const [title, setTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [originalText, setOriginalText] = useState('');

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
      await createJobPosting({
        /*
         * 선택 입력값은 비어 있을 경우 null로 전달한다.
         */
        companyName: companyName.trim() || null,
        title: title.trim(),
        sourceUrl: sourceUrl.trim() || null,
        originalText: originalText.trim(),
      });

      /*
       * 등록 성공 후 입력창을 초기화한다.
       */
      setCompanyName('');
      setTitle('');
      setSourceUrl('');
      setOriginalText('');

      setMessage('채용공고가 등록되었습니다.');

      /*
       * 부모 컴포넌트에 등록 완료 사실을 전달해
       * 목록을 다시 조회하게 한다.
       */
      await onCreated();
    } catch (caughtError) {
      const errorMessage =
        caughtError instanceof Error
          ? caughtError.message
          : '알 수 없는 오류가 발생했습니다.';

      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <h2>채용공고 등록</h2>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="companyName">회사명</label>
          <input
            id="companyName"
            type="text"
            value={companyName}
            onChange={(event) =>
              setCompanyName(event.target.value)
            }
          />
        </div>

        <div>
          <label htmlFor="title">공고 제목</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(event) =>
              setTitle(event.target.value)
            }
            required
          />
        </div>

        <div>
          <label htmlFor="sourceUrl">공고 URL</label>
          <input
            id="sourceUrl"
            type="url"
            value={sourceUrl}
            onChange={(event) =>
              setSourceUrl(event.target.value)
            }
          />
        </div>

        <div>
          <label htmlFor="originalText">공고 원문</label>
          <textarea
            id="originalText"
            value={originalText}
            onChange={(event) =>
              setOriginalText(event.target.value)
            }
            required
          />
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? '등록 중...' : '등록'}
        </button>
      </form>

      {message && <p>{message}</p>}
      {error && <p>{error}</p>}
    </section>
  );
}

export default JobPostingCreateForm;