import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import './JobPostingCreateForm.css';
import { createJobPosting } from '../api/jobPostingApi';
import { ApiError, userMessageOf } from '../api/apiError';
import type { CreateJobPostingRequest, JobPosting, SalaryFilter } from '../types/jobPosting';
import OriginalTextLength from './OriginalTextLength';
import { isOriginalTextTooLong, ORIGINAL_TEXT_TOO_LONG_MESSAGE } from '../utils/originalTextLength';
import { SALARY_OPTIONS } from '../constants/salaryOptions';
import {
  EMPTY_POSTING_DRAFT,
  readPostingDraft,
  removePostingDraft,
  writePostingDraft,
} from '../utils/postingDraftStorage';

interface JobPostingCreateFormProps {
  // 登録に成功したときに、登録した求人を渡して呼ぶ。
  onCreated: (jobPosting: JobPosting) => Promise<void> | void;
  // 入力途中の内容を一時保存するキー。ユーザーごとに分ける。
  draftKey: string;
}

function JobPostingCreateForm({
  onCreated,
  draftKey,
}: JobPostingCreateFormProps) {
  // 前回の入力が残っていれば、そこから始める。
  const [restoredDraft] = useState(() => readPostingDraft(draftKey));
  const initial = restoredDraft ?? EMPTY_POSTING_DRAFT;

  const [companyName, setCompanyName] = useState(initial.companyName);
  const [title, setTitle] = useState(initial.title);
  const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl);
  const [originalText, setOriginalText] = useState(initial.originalText);
  const [salaryMin, setSalaryMin] = useState<SalaryFilter>(initial.salaryMin);
  const [salaryMax, setSalaryMax] = useState<SalaryFilter>(initial.salaryMax);
  const [applicationDeadline, setApplicationDeadline] = useState(initial.applicationDeadline);
  // 身に覚えのない入力に見えないよう、復元したことを知らせて消去できるようにする。
  const [restored, setRestored] = useState(restoredDraft !== null);
  const companyNameRef = useRef<HTMLInputElement>(null);
  const originalTextRef = useRef<HTMLTextAreaElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // セッションが切れて登録できなかったり画面を離れたりしても、入力を失わないようにする。
  useEffect(() => {
    writePostingDraft(draftKey, {
      companyName,
      title,
      sourceUrl,
      originalText,
      salaryMin,
      salaryMax,
      applicationDeadline,
    });
  }, [draftKey, companyName, title, sourceUrl, originalText, salaryMin, salaryMax, applicationDeadline]);

  const clearInputs = () => {
    setCompanyName('');
    setTitle('');
    setSourceUrl('');
    setOriginalText('');
    setSalaryMin(null);
    setSalaryMax(null);
    setApplicationDeadline('');
    setRestored(false);
    // 直後に画面を移動すると上のEffectは実行されないため、ここで消す。
    removePostingDraft(draftKey);
  };

  const handleClearRestored = () => {
    clearInputs();
    setError(null);
    setFieldErrors({});
    // 押したボタンは案内と一緒に消え、キーボードのフォーカスがページの先頭へ外れるため、入力の始めに移す。
    companyNameRef.current?.focus();
  };

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

    // サーバーも同じ上限で拒否するが、送る前に止めて、超えていることをその場で伝える。入力は残す。
    if (isOriginalTextTooLong(originalText)) {
      setError(null);
      setFieldErrors({ originalText: ORIGINAL_TEXT_TOO_LONG_MESSAGE });
      originalTextRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const created = await createJobPosting({
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
      clearInputs();

      // 登録したことは、移った先の画面で知らせる。この画面はすぐに離れるため、ここでは表示しない。
      await onCreated(created);
    } catch (caughtError) {
      if (caughtError instanceof ApiError) {
        setFieldErrors(caughtError.fieldErrors);
      }

      setError(userMessageOf(caughtError, '不明なエラーが発生しました。'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="job-posting-create-form">
      <h2 >求人登録</h2>

      {restored && (
        <div className="job-posting-create-form__restored">
          <p role="status">前回入力した内容を復元しました。</p>
          <button type="button" onClick={handleClearRestored}>入力を消去</button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="companyName">会社名</label>
          <input
            ref={companyNameRef}
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
            ref={originalTextRef}
            id="originalText"
            aria-invalid={fieldErrors.originalText ? true : undefined}
            // 文字数と上限は常に、エラーはあるときだけ説明として読み上げる。
            aria-describedby={fieldErrors.originalText
              ? 'create-originalText-error create-originalText-length'
              : 'create-originalText-length'}
            value={originalText}
            onChange={(event) =>
              setOriginalText(event.target.value)
            }
            required
          />
          <OriginalTextLength id="create-originalText-length" text={originalText} />
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

      {error && (
        <p role="alert" className="job-posting-create-form__error">
          {error}
        </p>
      )}
    </section>
  );
}

export default JobPostingCreateForm;
