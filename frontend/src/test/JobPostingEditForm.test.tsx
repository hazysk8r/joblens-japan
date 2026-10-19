import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import JobPostingEditForm from '../components/JobPostingEditForm';
import type { JobPosting } from '../types/jobPosting';

const fields = [
  ['companyName', '회사명'],
  ['title', '공고 제목'],
  ['sourceUrl', '공고 URL'],
  ['originalText', '공고 원문'],
  ['salaryMin', '최저 월급'],
  ['salaryMax', '최고 월급'],
  ['applicationDeadline', '締切日'],
] as const;

const posting: JobPosting = {
  id: 12,
  companyName: '札幌クラウド',
  title: 'エンジニア',
  sourceUrl: 'https://example.com/jobs/12',
  originalText: 'JavaとAWSの開発経験',
  salaryMin: 300000,
  salaryMax: 500000,
  applicationDeadline: '2026-12-01',
  createdAt: '2026-10-15T00:00:00Z',
  applicationStatus: 'SAVED',
  version: 3,
};

const unknownFieldCases: { name: string; fieldErrors: Record<string, string> }[] = [
  { name: '未知のフィールドのみ', fieldErrors: { serverOnly: '未知のエラー' } },
  { name: '既知と未知のフィールドの混在', fieldErrors: { title: 'タイトルを確認してください。', serverOnly: '未知のエラー' } },
];

afterEach(cleanup);

describe('JobPostingEditFormのフィールドエラー', () => {
  test('七つの入力欄を個別のエラーメッセージと関連付ける', () => {
    const fieldErrors = Object.fromEntries(
      fields.map(([field]) => [field, `${field}を確認してください。`]),
    );
    render(
      <JobPostingEditForm
        jobPosting={posting}
        saving={false}
        fieldErrors={fieldErrors}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
      />,
    );

    for (const [field, label] of fields) {
      const input = screen.getByLabelText(label);
      const message = screen.getByText(fieldErrors[field]);
      expect(message).toHaveAttribute('id', `edit-${posting.id}-${field}-error`);
      expect(message).toHaveClass('job-posting-edit-form__error');
      expect(message).not.toHaveAttribute('role', 'alert');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input).toHaveAttribute('aria-describedby', message.id);
      expect(input).toHaveAccessibleDescription(fieldErrors[field]);
    }
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test.each(unknownFieldCases)('$nameでは未知のメッセージを表示しない', ({ fieldErrors }) => {
    render(
      <JobPostingEditForm
        jobPosting={posting}
        saving={false}
        fieldErrors={fieldErrors}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByText('未知のエラー')).not.toBeInTheDocument();
    if (fieldErrors.title) {
      expect(screen.getByLabelText('공고 제목')).toHaveAccessibleDescription(fieldErrors.title);
    } else {
      expect(screen.getByLabelText('공고 제목')).not.toHaveAttribute('aria-invalid');
      expect(screen.getByLabelText('공고 제목')).not.toHaveAttribute('aria-describedby');
    }
    for (const [field, label] of fields) {
      if (field !== 'title') {
        expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid');
        expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-describedby');
      }
    }
  });

  test('エラーを更新して解除しても下書きと編集開始時のversionを保持する', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    const { rerender } = render(
      <JobPostingEditForm
        jobPosting={posting}
        saving={false}
        expectedVersion={2}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    for (const [, label] of fields) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid');
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-describedby');
    }
    await user.clear(screen.getByLabelText('공고 제목'));
    await user.type(screen.getByLabelText('공고 제목'), '保存前の下書き');

    const refreshedPosting = { ...posting, title: 'サーバーの新しいタイトル', originalText: 'サーバーの新しい原文', version: 9 };
    rerender(
      <JobPostingEditForm
        jobPosting={refreshedPosting}
        saving={false}
        expectedVersion={9}
        fieldErrors={{ title: '最初のタイトルエラー' }}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByLabelText('공고 제목')).toHaveAccessibleDescription('最初のタイトルエラー');
    await user.type(screen.getByLabelText('공고 제목'), 'を継続');
    expect(screen.getByLabelText('공고 제목')).toHaveAccessibleDescription('最初のタイトルエラー');

    rerender(
      <JobPostingEditForm
        jobPosting={refreshedPosting}
        saving={false}
        expectedVersion={9}
        fieldErrors={{ salaryMax: '更新された最高月給エラー' }}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    expect(screen.queryByText('最初のタイトルエラー')).not.toBeInTheDocument();
    expect(screen.getByLabelText('공고 제목')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('공고 제목')).not.toHaveAttribute('aria-describedby');
    expect(screen.getByLabelText('최고 월급')).toHaveAccessibleDescription('更新された最高月給エラー');

    rerender(
      <JobPostingEditForm
        jobPosting={refreshedPosting}
        saving={false}
        expectedVersion={9}
        fieldErrors={{}}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    expect(screen.queryByText('更新された最高月給エラー')).not.toBeInTheDocument();
    for (const [, label] of fields) {
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-invalid');
      expect(screen.getByLabelText(label)).not.toHaveAttribute('aria-describedby');
    }
    expect(screen.getByLabelText('공고 제목')).toHaveValue('保存前の下書きを継続');
    expect(screen.getByLabelText('공고 원문')).toHaveValue(posting.originalText);
    await user.click(screen.getByRole('button', { name: '저장' }));
    expect(onSave).toHaveBeenCalledWith(
      posting.id,
      {
        companyName: posting.companyName,
        title: '保存前の下書きを継続',
        sourceUrl: posting.sourceUrl,
        originalText: posting.originalText,
        salaryMin: posting.salaryMin,
        salaryMax: posting.salaryMax,
        applicationDeadline: posting.applicationDeadline,
      },
      2,
    );
  });

  test('複数の求人フォームで同じフィールドのエラーIDが衝突しない', () => {
    const secondPosting = { ...posting, id: 13 };
    render(
      <>
        <div data-testid="first-edit-form">
          <JobPostingEditForm
            jobPosting={posting}
            saving={false}
            fieldErrors={{ title: '一つ目のタイトルエラー' }}
            onSave={vi.fn().mockResolvedValue(undefined)}
            onCancel={vi.fn()}
          />
        </div>
        <div data-testid="second-edit-form">
          <JobPostingEditForm
            jobPosting={secondPosting}
            saving={false}
            fieldErrors={{ title: '二つ目のタイトルエラー' }}
            onSave={vi.fn().mockResolvedValue(undefined)}
            onCancel={vi.fn()}
          />
        </div>
      </>,
    );
    const first = within(screen.getByTestId('first-edit-form'));
    const second = within(screen.getByTestId('second-edit-form'));
    const firstMessage = first.getByText('一つ目のタイトルエラー');
    const secondMessage = second.getByText('二つ目のタイトルエラー');
    expect(firstMessage.id).not.toBe(secondMessage.id);
    expect(first.getByLabelText('공고 제목')).toHaveAttribute('aria-describedby', firstMessage.id);
    expect(second.getByLabelText('공고 제목')).toHaveAttribute('aria-describedby', secondMessage.id);
    expect(first.getByLabelText('공고 제목')).toHaveAccessibleDescription('一つ目のタイトルエラー');
    expect(second.getByLabelText('공고 제목')).toHaveAccessibleDescription('二つ目のタイトルエラー');
  });
});
