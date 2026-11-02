import {
  useState,
  type FormEvent,
} from 'react';

import type {
  JobPostingMemo,
  UpdateJobPostingMemoRequest,
} from '../types/jobPostingMemo';

interface JobPostingMemoEditFormProps {
  jobPostingMemo: JobPostingMemo;
  saving: boolean;

  onSave: (
    request: UpdateJobPostingMemoRequest,
  ) => Promise<void>;

  onCancel: () => void;
}

interface EditFormState {
  content: string;
}

function JobPostingMemoEditForm({
  jobPostingMemo,
  saving,
  onSave,
  onCancel,
}: JobPostingMemoEditFormProps) {
  const [editForm, setEditForm] =
    useState<EditFormState>({
      content: jobPostingMemo.content ?? '',
    });

  const [errorMessage, setErrorMessage] =
    useState<string>('');

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const content = editForm.content.trim();

    if (!content) {
      setErrorMessage(
        'メモ内容を入力してください。',
      );
      return;
    }

    if (content.length > 250) {
      setErrorMessage(
        'メモは250文字以内で入力してください。',
      );
      return;
    }

    setErrorMessage('');

    const request: UpdateJobPostingMemoRequest = {
      content,
    };

    await onSave(request);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label
          htmlFor={
            `edit-content-${jobPostingMemo.id}`
          }
        >
          メモを編集
        </label>

        <textarea
          id={
            `edit-content-${jobPostingMemo.id}`
          }
          value={editForm.content}
          maxLength={250}
          disabled={saving}
          onChange={(event) => {
            if (errorMessage) {
              setErrorMessage('');
            }

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
        {saving
          ? '保存中…'
          : '保存'}
      </button>

      <button
        type="button"
        disabled={saving}
        onClick={onCancel}
      >
        キャンセル
      </button>
    </form>
  );
}

export default JobPostingMemoEditForm;