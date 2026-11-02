import { useState } from 'react';
import type { FormEvent } from 'react';

import type {
  JobPosting,
  SalaryFilter,
  UpdateJobPostingRequest,
} from '../types/jobPosting';

import { SALARY_OPTIONS } from '../constants/salaryOptions';

interface JobPostingEditFormProps {
  jobPosting: JobPosting;
  saving: boolean;
  expectedVersion?: number;
  fieldErrors?: Record<string, string>;

  onSave: (
    id: number,
    request: UpdateJobPostingRequest,
    expectedVersion: number,
  ) => Promise<void>;

  onCancel: () => void;
}

interface EditFormState {
  companyName: string;
  title: string;
  sourceUrl: string;
  originalText: string;
  salaryMin: SalaryFilter;
  salaryMax: SalaryFilter;
  applicationDeadline: string;
}

function JobPostingEditForm({
  jobPosting,
  saving,
  expectedVersion,
  fieldErrors = {},
  onSave,
  onCancel,
}: JobPostingEditFormProps) {
  // 編集中にPropsが更新されても、開始時のVersionをDraftと一緒に保持する。
  const [editVersion] = useState(expectedVersion ?? jobPosting.version);
  /*
   * これらの入力値は編集フォームでのみ使うため、
   * Appではなく編集フォームのコンポーネントで管理する。
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
      salaryMin:
        jobPosting.salaryMin ?? null,
      salaryMax:
        jobPosting.salaryMax ?? null,
      applicationDeadline:
        jobPosting.applicationDeadline ?? ''
    });

  const [
    validationError,
    setValidationError,
  ] = useState<string | null>(null);

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
     * 実際のAPI呼び出しは親のAppが担当する。
     * 子は整理した入力データを親に渡す。
     */
    await onSave(jobPosting.id, request, editVersion);
  };

  return (
    <form className="job-posting-edit-form" onSubmit={handleSubmit}>
      <div>
        <label
          htmlFor={`edit-company-${jobPosting.id}`}
        >
          会社名
        </label>

        <input
          id={`edit-company-${jobPosting.id}`}
          {...getFieldErrorAttributes('companyName')}
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
          disabled={saving}
          required
          onChange={(event) => {
            setEditForm((previous) => ({
              ...previous,
              title: event.target.value,
            }));
          }}
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
          disabled={saving}
          onChange={(event) => {
            setEditForm((previous) => ({
              ...previous,
              sourceUrl:
                event.target.value,
            }));
          }}
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
          id={`edit-text-${jobPosting.id}`}
          {...getFieldErrorAttributes('originalText')}
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

            setEditForm((previous) => ({
              ...previous,
              salaryMin:
                value === "" ? null : Number(value),
            }));
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

            setEditForm((previous) => ({
              ...previous,
              salaryMax:
                value === "" ? null : Number(value),
            }));
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
        <label htmlFor={`edit-applicationDeadline-${jobPosting.id}`}>締切日</label>
          <input 
            id={`edit-applicationDeadline-${jobPosting.id}`}
            {...getFieldErrorAttributes('applicationDeadline')}
            type="date"
            value={editForm.applicationDeadline}
            disabled={saving}
            onChange={(event) => {
              setEditForm((previous) => ({
                ...previous,
                applicationDeadline: event.target.value,
              }));
            }}
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
        disabled={saving}
      >
        {saving ? '保存中…' : '保存'}
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

export default JobPostingEditForm;
