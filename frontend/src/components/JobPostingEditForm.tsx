import { useState } from 'react';
import type { FormEvent } from 'react';

import type {
  JobPosting,
  UpdateJobPostingRequest,
} from '../types/jobPosting';

interface JobPostingEditFormProps {
  jobPosting: JobPosting;
  saving: boolean;

  onSave: (
    id: number,
    request: UpdateJobPostingRequest,
  ) => Promise<void>;

  onCancel: () => void;
}

interface EditFormState {
  companyName: string;
  title: string;
  sourceUrl: string;
  originalText: string;
}

function JobPostingEditForm({
  jobPosting,
  saving,
  onSave,
  onCancel,
}: JobPostingEditFormProps) {
  /*
   * 이 입력값들은 수정 폼에서만 사용하므로
   * App이 아니라 수정 폼 컴포넌트에서 관리한다.
   */
  const [editForm, setEditForm] =
    useState<EditFormState>({
      companyName:
        jobPosting.companyName ?? '',
      title: jobPosting.title,
      sourceUrl:
        jobPosting.sourceUrl ?? '',
      originalText:
        jobPosting.originalText,
    });

  const [
    validationError,
    setValidationError,
  ] = useState<string | null>(null);

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const title = editForm.title.trim();
    const originalText =
      editForm.originalText.trim();

    /*
     * required만으로는 공백 문자열을
     * 완전히 막을 수 없으므로 trim() 후 확인한다.
     */
    if (!title || !originalText) {
      setValidationError(
        '공고 제목과 공고 원문을 입력해 주세요.',
      );
      return;
    }

    setValidationError(null);

    const request: UpdateJobPostingRequest = {
      companyName:
        editForm.companyName.trim() || null,
      title,
      sourceUrl:
        editForm.sourceUrl.trim() || null,
      originalText,
    };

    /*
     * 실제 API 호출은 부모인 App이 담당한다.
     * 자식은 정리된 입력 데이터를 부모에게 전달한다.
     */
    await onSave(jobPosting.id, request);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label
          htmlFor={`edit-company-${jobPosting.id}`}
        >
          회사명
        </label>

        <input
          id={`edit-company-${jobPosting.id}`}
          type="text"
          value={editForm.companyName}
          disabled={saving}
          onChange={(event) => {
            setEditForm((previous) => ({
              ...previous,
              companyName:
                event.target.value,
            }));
          }}
        />
      </div>

      <div>
        <label
          htmlFor={`edit-title-${jobPosting.id}`}
        >
          공고 제목
        </label>

        <input
          id={`edit-title-${jobPosting.id}`}
          type="text"
          value={editForm.title}
          disabled={saving}
          required
          onChange={(event) => {
            setEditForm((previous) => ({
              ...previous,
              title: event.target.value,
            }));
          }}
        />
      </div>

      <div>
        <label
          htmlFor={`edit-url-${jobPosting.id}`}
        >
          공고 URL
        </label>

        <input
          id={`edit-url-${jobPosting.id}`}
          type="url"
          value={editForm.sourceUrl}
          disabled={saving}
          onChange={(event) => {
            setEditForm((previous) => ({
              ...previous,
              sourceUrl:
                event.target.value,
            }));
          }}
        />
      </div>

      <div>
        <label
          htmlFor={`edit-text-${jobPosting.id}`}
        >
          공고 원문
        </label>

        <textarea
          id={`edit-text-${jobPosting.id}`}
          value={editForm.originalText}
          disabled={saving}
          required
          onChange={(event) => {
            setEditForm((previous) => ({
              ...previous,
              originalText:
                event.target.value,
            }));
          }}
        />
      </div>

      {validationError && (
        <p role="alert">
          {validationError}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
      >
        {saving ? '저장 중...' : '저장'}
      </button>

      <button
        type="button"
        disabled={saving}
        onClick={onCancel}
      >
        취소
      </button>
    </form>
  );
}

export default JobPostingEditForm;