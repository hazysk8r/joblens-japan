import { useState } from 'react';
import type { FormEvent } from 'react';
import './JobPostingCreateForm.css';
import { createJobPosting } from '../api/jobPostingApi';
import { ApiError } from '../api/apiError';
import type { CreateJobPostingRequest, SalaryFilter } from '../types/jobPosting';
import { SALARY_OPTIONS } from '../constants/salaryOptions';

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
         * 선택 입력값은 비어 있을 경우 null로 전달한다.
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
       * 등록 성공 후 입력창을 초기화한다.
       */
      setCompanyName('');
      setTitle('');
      setSourceUrl('');
      setOriginalText('');
      setSalaryMin(null);
      setSalaryMax(null);
      setApplicationDeadline('');

      setMessage('채용공고가 등록되었습니다.');

      /*
       * 부모 컴포넌트에 등록 완료 사실을 전달해
       * 목록을 다시 조회하게 한다.
       */
      await onCreated();
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setFieldErrors(caughtError.fieldErrors);
      }

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
    <section className="job-posting-create-form">
      <h2 >채용공고 등록</h2>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="companyName">회사명</label>
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
          <label htmlFor="title">공고 제목</label>
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
          <label htmlFor="sourceUrl">공고 URL</label>
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
          <label htmlFor="originalText">공고 원문</label>
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
          <label htmlFor="create-salaryMin">최저 월급</label>
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
            <option value="">미지정</option>

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
          <label htmlFor="create-salaryMax">최고 월급</label>
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
            <option value="">미지정</option>

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
          {submitting ? '등록 중...' : '등록'}
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
