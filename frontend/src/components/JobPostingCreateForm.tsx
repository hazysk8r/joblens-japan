import { useState } from 'react';
import type { FormEvent } from 'react';
import './JobPostingCreateForm.css';
import { createJobPosting } from '../api/jobPostingApi';
import { ApiError } from '../api/apiError';
import type { CreateJobPostingRequest, SalaryFilter } from '../types/jobPosting';
import { SALARY_OPTIONS } from '../constants/salaryOptions';

interface JobPostingCreateFormProps {
  /**
   * 登録成功後に親コンポーネントの一覧を
   * 再取得するために呼び出す。
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
  const [salaryMin, setSalaryMin] = useState<SalaryFilter>(null);
  const [salaryMax, setSalaryMax] = useState<SalaryFilter>(null);
  const [applicationDeadline, setApplicationDeadline] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // フィールドのエラー状態に応じて、アクセシビリティ属性を設定する。
  const getFieldErrorAttributes = (field: keyof CreateJobPostingRequest) => ({
    'aria-invalid': fieldErrors[field] ? true : undefined,
    'aria-describedby': fieldErrors[field]
      ? `create-${field}-error`
      : undefined,
  });

  // 該当フィールドにエラーがある場合、そのメッセージを表示する。
  const renderFieldError = (field: keyof CreateJobPostingRequest) => {
    const fieldError = fieldErrors[field];

    return fieldError ? (
      <p
        id={`create-${field}-error`}
        className="job-posting-create-form__error"
      >
        {fieldError}
      </p>
    ) : null;
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    setSubmitting(true);
    setMessage(null);
    setError(null);
    setFieldErrors({});

    try {
      await createJobPosting({
        /*
         * 任意の入力値は、空の場合にnullとして渡す。
         */
        companyName: companyName.trim() || null,
        title: title.trim(),
        sourceUrl: sourceUrl.trim() || null,
        originalText: originalText.trim(),
        salaryMin: salaryMin || null,
        salaryMax: salaryMax || null,
        applicationDeadline: applicationDeadline || null,
      });

      /*
       * 登録成功後に入力欄を初期化する。
       */
      setCompanyName('');
      setTitle('');
      setSourceUrl('');
      setOriginalText('');
      setSalaryMin(null);
      setSalaryMax(null);
      setApplicationDeadline('');

      setMessage('求人を登録しました。');

      /*
       * 親コンポーネントに登録完了を伝え、
       * 一覧を再取得させる。
       */
      await onCreated();
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setFieldErrors(caughtError.fieldErrors);
      }

      const errorMessage =
        caughtError instanceof Error
          ? caughtError.message
          : '不明なエラーが発生しました。';

      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="job-posting-create-form">
      <h2 >求人登録</h2>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="companyName">会社名</label>
          <input
            id="companyName"
            {...getFieldErrorAttributes('companyName')}
            type="text"
            value={companyName}
            onChange={(event) =>
              setCompanyName(event.target.value)
            }
          />
          {renderFieldError('companyName')}
        </div>

        <div>
          <label htmlFor="title">求人タイトル</label>
          <input
            id="title"
            {...getFieldErrorAttributes('title')}
            type="text"
            value={title}
            onChange={(event) =>
              setTitle(event.target.value)
            }
            required
          />
          {renderFieldError('title')}
        </div>

        <div>
          <label htmlFor="sourceUrl">求人URL</label>
          <input
            id="sourceUrl"
            {...getFieldErrorAttributes('sourceUrl')}
            type="url"
            value={sourceUrl}
            onChange={(event) =>
              setSourceUrl(event.target.value)
            }
          />
          {renderFieldError('sourceUrl')}
        </div>

        <div>
          <label htmlFor="originalText">求人原文</label>
          <textarea
            id="originalText"
            {...getFieldErrorAttributes('originalText')}
            value={originalText}
            onChange={(event) =>
              setOriginalText(event.target.value)
            }
            required
          />
          {renderFieldError('originalText')}
        </div>

        <div>
          <label htmlFor="create-salaryMin">最低月給</label>
          <select
            id="create-salaryMin"
            {...getFieldErrorAttributes('salaryMin')}
            value={salaryMin ?? ""}
            onChange={(event) => {
              const value = event.target.value;

              setSalaryMin(
                value === "" ? null : Number(value)
              );
            }}
          >
            <option value="">指定なし</option>

            {SALARY_OPTIONS.map((salary) => (
              <option 
                key={salary}
                value={salary}
                disabled={
                  salaryMax != null &&
                  salary > salaryMax
                }
              >
                {salary.toLocaleString()}円
              </option>
            ))}
          </select>
          {renderFieldError('salaryMin')}
        </div>

        <div>
          <label htmlFor="create-salaryMax">最高月給</label>
          <select
            id="create-salaryMax"
            {...getFieldErrorAttributes('salaryMax')}
            value={salaryMax ?? ""}
            onChange={(event) => {
              const value = event.target.value;

              setSalaryMax(
                value === "" ? null : Number(value)
              );
            }}
          >
            <option value="">指定なし</option>

            {SALARY_OPTIONS.map((salary) => (
              <option
                key={salary}
                value={salary}
                disabled={
                  salaryMin != null &&
                  salary < salaryMin
                }
              >
                {salary.toLocaleString()}円
              </option>
            ))}
          </select>
          {renderFieldError('salaryMax')}
        </div>

        <div>
          <label htmlFor="applicationDeadline">応募締切日</label>
          <input
            id="applicationDeadline"
            {...getFieldErrorAttributes('applicationDeadline')}
            type="date"
            value={applicationDeadline}
            onChange={(event) => 
              setApplicationDeadline(event.target.value)
            }
          />
          {renderFieldError('applicationDeadline')}
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? '登録中…' : '登録'}
        </button>
      </form>

      {message && <p>{message}</p>}
      {error && (
        <p role="alert" className="job-posting-create-form__error">
          {error}
        </p>
      )}
    </section>
  );
}

export default JobPostingCreateForm;
