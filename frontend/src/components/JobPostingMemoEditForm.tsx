
import { useState, type FormEvent } from "react";
import type {
  JobPostingMemo,
  UpdateJobPostingMemoRequest,
} from "../types/jobPostingMemo";
import type {
  JobPosting,
} from '../types/jobPosting';

interface JobPostingMemoEditFormProps {
  jobPostingMemo: JobPostingMemo;
  jobPosting: JobPosting;
  saving: boolean;

  onSave: (
    jobPostingId: number,
    memoId: number,
    request: UpdateJobPostingMemoRequest,
  ) => Promise<void>;

  onCancel: () => void;
}

interface EditFormState {
  content: string;
}

function JobPostingMemoEditForm({
  jobPostingMemo,
  jobPosting,
  saving,
  onSave,
  onCancel,
}: JobPostingMemoEditFormProps) {

  const [editForm, setEditForm] =
    useState<EditFormState>({
      content:
        jobPostingMemo.content ?? ''
    });

  const [errorMessage, setErrorMessage] = useState<string>('');
  
  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const content = editForm.content.trim();

    if (!content) {
      setErrorMessage('메모 내용을 입력해주세요');
      return;
    }

    if (content.length > 250) {
      setErrorMessage('메모는 최대 250자까지 입력 가능합니다.');
      return;
    }
    
    setErrorMessage('');

    const request: UpdateJobPostingMemoRequest = {
      content:
        editForm.content.trim()
    };

    await onSave(jobPosting.id, jobPostingMemo.id, request);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label
          htmlFor={`edit-content-${jobPostingMemo.id}`}>
            메모 수정
        </label>

        <textarea
          id={`edit-content-${jobPostingMemo.id}`}
          value={editForm.content}
          maxLength={250}
          disabled={saving}
          onChange={(event) => {
            if (errorMessage) setErrorMessage(''); // 입력 시 기존 에러 메시지 초기화
            setEditForm((previous) => ({
              ...previous,
              content: event.target.value,
            }));
          }}
        />
      </div>

      {errorMessage && (
        <p role="alert">
          {errorMessage}
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

export default JobPostingMemoEditForm;
