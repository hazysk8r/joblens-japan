import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import type {
  JobPosting,
  UpdateJobPostingRequest,
} from '../types/jobPosting';

import { SALARY_OPTIONS } from '../constants/salaryOptions';
import OriginalTextLength from './OriginalTextLength';
import { isOriginalTextTooLong, ORIGINAL_TEXT_TOO_LONG_MESSAGE } from '../utils/originalTextLength';
import {
  postingValuesOf,
  samePostingValues,
  type PostingDraft,
} from '../utils/postingDraftStorage';

interface JobPostingEditFormProps {
  jobPosting: JobPosting;
  saving: boolean;
  expectedVersion?: number;
  fieldErrors?: Record<string, string>;
  // 一時保存から再開するときの入力値。なければ求人の今の内容から始める。
  initialValues?: PostingDraft;
  // 入力が変わるたびに呼ぶ。一時保存に使う。
  onChange?: (values: PostingDraft) => void;
  // 表示したときに最初の入力欄へフォーカスする。
  autoFocusFirstField?: boolean;

  onSave: (
    id: number,
    request: UpdateJobPostingRequest,
    expectedVersion: number,
  ) => Promise<void>;

  // changedは、求人の今の内容から入力を変えているか。
  onCancel: (changed: boolean) => void;
}

function JobPostingEditForm({
  jobPosting,
  saving,
  expectedVersion,
  fieldErrors: serverFieldErrors = {},
  initialValues,
  onChange,
  autoFocusFirstField = false,
  onSave,
  onCancel,
}: JobPostingEditFormProps) {
  // 編集中にPropsが更新されても、開始時のVersionをDraftと一緒に保持する。
  const [editVersion] = useState(expectedVersion ?? jobPosting.version);
  /*
   * これらの入力値は編集フォームでのみ使うため、
   * Appではなく編集フォームのコンポーネントで管理する。
   */
  const [editForm, setEditForm] = useState<PostingDraft>(
    () => initialValues ?? postingValuesOf(jobPosting),
  );

  const [
    validationError,
    setValidationError,
  ] = useState<string | null>(null);

  // 原文が上限を超えたまま保存しようとしたか。原文を変えたら消す。
  const [originalTextTooLong, setOriginalTextTooLong] = useState(false);
  const fieldErrors: Record<string, string> = originalTextTooLong
    ? { ...serverFieldErrors, originalText: ORIGINAL_TEXT_TOO_LONG_MESSAGE }
    : serverFieldErrors;

  const companyNameRef = useRef<HTMLInputElement>(null);
  const originalTextRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocusFirstField) {
      companyNameRef.current?.focus();
    }
  }, [autoFocusFirstField]);

  // 画面の入力と、一時保存のための通知を必ず一緒に行う。
  const update = (patch: Partial<PostingDraft>) => {
    const next = { ...editForm, ...patch };
    if (patch.originalText !== undefined) {
      setOriginalTextTooLong(false);
    }
    setEditForm(next);
    onChange?.(next);
  };

  // 求人ごとに一意なIDで、各入力欄とサーバーの検証メッセージを関連付ける。
  const getFieldErrorAttributes = (field: keyof UpdateJobPostingRequest) => ({
    'aria-invalid': fieldErrors[field] ? true : undefined,
    'aria-describedby': fieldErrors[field]
      ? `edit-${jobPosting.id}-${field}-error`
      : undefined,
  });

  const renderFieldError = (field: keyof UpdateJobPostingRequest) => {
    const fieldError = fieldErrors[field];

    return fieldError ? (
      <p
        id={`edit-${jobPosting.id}-${field}-error`}
        className="job-posting-edit-form__error"
      >
        {fieldError}
      </p>
    ) : null;
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    // ボタンを無効にしないため、保存中の二重送信はここで防ぐ。
    if (saving) {
      return;
    }

    const title = editForm.title.trim();
    const originalText =
      editForm.originalText.trim();

    /*
     * requiredだけでは空白のみの文字列を
     * 完全に防げないため、trim()の後で確認する。
     */
    if (!title || !originalText) {
      setValidationError(
        '求人タイトルと求人原文を入力してください。',
      );
      return;
    }

    setValidationError(null);

    // サーバーも同じ上限で拒否するが、送る前に止めて、超えていることをその場で伝える。入力は残す。
    if (isOriginalTextTooLong(editForm.originalText)) {
      setOriginalTextTooLong(true);
      originalTextRef.current?.focus();
      return;
    }

    const request: UpdateJobPostingRequest = {
      companyName:
        editForm.companyName.trim() || null,
      title,
      sourceUrl:
        editForm.sourceUrl.trim() || null,
      originalText,
      salaryMin:
        editForm.salaryMin ?? null,
      salaryMax:
        editForm.salaryMax ?? null,
      applicationDeadline:
        editForm.applicationDeadline || null
    };

    /*
     * 実際のAPI呼び出しは親が担当する。
     * 子は整理した入力データを親に渡す。
     */
    await onSave(jobPosting.id, request, editVersion);
  };

  /*
   * 保存中は入力を変更できないようにする。disabledにすると、保存を押した直後に
   * キーボードのフォーカスがページの先頭へ外れるため、入力欄はreadOnly、ボタンはaria-disabledにする。
   * 選択欄にはreadOnlyがないためdisabledにする(保存を押した時点でフォーカスはボタンにある)。
   */
  return (
    <form className="job-posting-edit-form" onSubmit={handleSubmit}>
      <div>
        <label
          htmlFor={`edit-company-${jobPosting.id}`}
        >
          会社名
        </label>

        <input
          ref={companyNameRef}
          id={`edit-company-${jobPosting.id}`}
          {...getFieldErrorAttributes('companyName')}
          type="text"
          value={editForm.companyName}
          readOnly={saving}
          onChange={(event) => update({ companyName: event.target.value })}
        />
        {renderFieldError('companyName')}
      </div>

      <div>
        <label
          htmlFor={`edit-title-${jobPosting.id}`}
        >
          求人タイトル
        </label>

        <input
          id={`edit-title-${jobPosting.id}`}
          {...getFieldErrorAttributes('title')}
          type="text"
          value={editForm.title}
          readOnly={saving}
          required
          onChange={(event) => update({ title: event.target.value })}
        />
        {renderFieldError('title')}
      </div>

      <div>
        <label
          htmlFor={`edit-url-${jobPosting.id}`}
        >
          求人URL
        </label>

        <input
          id={`edit-url-${jobPosting.id}`}
          {...getFieldErrorAttributes('sourceUrl')}
          type="url"
          value={editForm.sourceUrl}
          readOnly={saving}
          onChange={(event) => update({ sourceUrl: event.target.value })}
        />
        {renderFieldError('sourceUrl')}
      </div>

      <div>
        <label
          htmlFor={`edit-text-${jobPosting.id}`}
        >
          求人原文
        </label>

        <textarea
          ref={originalTextRef}
          id={`edit-text-${jobPosting.id}`}
          aria-invalid={fieldErrors.originalText ? true : undefined}
          // 文字数と上限は常に、エラーはあるときだけ説明として読み上げる。
          aria-describedby={fieldErrors.originalText
            ? `edit-${jobPosting.id}-originalText-error edit-${jobPosting.id}-originalText-length`
            : `edit-${jobPosting.id}-originalText-length`}
          value={editForm.originalText}
          readOnly={saving}
          required
          onChange={(event) => update({ originalText: event.target.value })}
        />
        <OriginalTextLength id={`edit-${jobPosting.id}-originalText-length`} text={editForm.originalText} />
        {renderFieldError('originalText')}
      </div>

      <div>
        <label htmlFor={`edit-salaryMin-${jobPosting.id}`}>最低月給</label>
        <select
          id={`edit-salaryMin-${jobPosting.id}`}
          {...getFieldErrorAttributes('salaryMin')}
          value={editForm.salaryMin ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            update({ salaryMin: value === "" ? null : Number(value) });
          }}
          disabled={saving}
        >
          <option value="">指定なし</option>

          {SALARY_OPTIONS.map((salary) => (
            <option
              key={salary}
              value={salary}
              disabled={
                editForm.salaryMax != null &&
                salary > editForm.salaryMax
              }
            >
              {salary.toLocaleString()}円
            </option>
          ))}
        </select>
        {renderFieldError('salaryMin')}
      </div>

      <div>
        <label htmlFor={`edit-salaryMax-${jobPosting.id}`}>最高月給</label>
        <select
          id={`edit-salaryMax-${jobPosting.id}`}
          {...getFieldErrorAttributes('salaryMax')}
          value={editForm.salaryMax ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            update({ salaryMax: value === "" ? null : Number(value) });
          }}
          disabled={saving}
        >
          <option value="">指定なし</option>

          {SALARY_OPTIONS.map((salary) => (
            <option
              key={salary}
              value={salary}
              disabled={
                editForm.salaryMin != null &&
                salary < editForm.salaryMin
              }
            >
              {salary.toLocaleString()}円
            </option>
          ))}

        </select>
        {renderFieldError('salaryMax')}
      </div>

      <div>
        <label htmlFor={`edit-applicationDeadline-${jobPosting.id}`}>応募締切日</label>
          <input
            id={`edit-applicationDeadline-${jobPosting.id}`}
            {...getFieldErrorAttributes('applicationDeadline')}
            type="date"
            value={editForm.applicationDeadline}
            readOnly={saving}
            onChange={(event) => update({ applicationDeadline: event.target.value })}
          />
        {renderFieldError('applicationDeadline')}
      </div>

      {validationError && (
        <p role="alert">
          {validationError}
        </p>
      )}

      <button
        type="submit"
        aria-disabled={saving}
      >
        {saving ? '保存中…' : '保存'}
      </button>

      <button
        type="button"
        aria-disabled={saving}
        onClick={() => {
          if (!saving) {
            onCancel(!samePostingValues(editForm, postingValuesOf(jobPosting)));
          }
        }}
      >
        キャンセル
      </button>
    </form>
  );
}

export default JobPostingEditForm;
