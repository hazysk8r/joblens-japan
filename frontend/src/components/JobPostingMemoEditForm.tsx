import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';

import type {
  JobPostingMemo,
  UpdateJobPostingMemoRequest,
} from '../types/jobPostingMemo';

interface JobPostingMemoEditFormProps {
  jobPostingMemo: JobPostingMemo;
  // 入力欄の最初の内容。編集を始めたとき(または最新の内容を読み込んだとき)の内容で、
  // 裏で一覧を取り直しても変えない。
  initialContent: string;
  saving: boolean;
  // 最新の内容を読み込んでいる間。入力は入れ替わるため、入力と保存を止める。
  locked?: boolean;
  // 作られたときに入力欄へフォーカスを移す。
  focusOnMount?: boolean;

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
  initialContent,
  saving,
  locked = false,
  focusOnMount = false,
  onSave,
  onCancel,
}: JobPostingMemoEditFormProps) {
  const [editForm, setEditForm] =
    useState<EditFormState>({
      content: initialContent,
    });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (focusOnMount && textarea !== null) {
      textarea.focus();
      // 続けて書き足せるよう、カーソルを末尾に置く。先頭のままだと、入力が内容の前に入る。
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
    // 作られたときだけ動かす。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          ref={textareaRef}
          value={editForm.content}
          maxLength={250}
          disabled={saving || locked}
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
        disabled={saving || locked}
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