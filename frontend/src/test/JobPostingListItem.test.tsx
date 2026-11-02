import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi, test, expect, describe } from 'vitest';

import '@testing-library/jest-dom/vitest';

import { extractRequiredSkills, fetchApplicationStatusHistory } from '../api/jobPostingApi';
import { deleteJobPostingMemo, getJobPostingMemos, updateJobPostingMemo, } from '../api/jobPostingMemoApi';
import type { JobPosting, JobPostingStatusHistory } from '../types/jobPosting';
import JobPostingListItem from '../components/JobPostingListItem';
import type { JobPostingMemo } from '../types/jobPostingMemo';
import { ApiError } from '../api/apiError';

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(getJobPostingMemos)
    .mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

vi.mock('../api/jobPostingApi');
vi.mock('../api/jobPostingMemoApi')

describe('skills', () => {

  test('技術がある求人で「技術スタックを見る」を押すと技術スタックを見られる', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: 'AWSエンジニア求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };
    vi.mocked(extractRequiredSkills)
      .mockResolvedValueOnce(["AWS"]);

    const user = userEvent.setup();
    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    const extractSkills = await screen.findByRole('button', {
      name: '技術スタックを見る',
    });
    await user.click(extractSkills);

    expect(extractRequiredSkills)
      .toHaveBeenLastCalledWith(
        1,
        expect.any(AbortSignal),
      );

    await screen.findByText('AWS');

  });

  test('技術がない求人で「技術スタックを見る」を押すと技術なしのメッセージを表示する', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };
    vi.mocked(extractRequiredSkills)
      .mockResolvedValueOnce([]);

    const user = userEvent.setup();
    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    const extractSkills = await screen.findByRole('button', {
      name: '技術スタックを見る',
    });
    await user.click(extractSkills);

    expect(extractRequiredSkills)
      .toHaveBeenLastCalledWith(
        1,
        expect.any(AbortSignal),
      );

    await screen.findByText('抽出された技術スタックはありません。');

  })

  test('存在しない求人で「技術スタックを見る」を押すとエラーメッセージを表示する', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };
    vi.mocked(extractRequiredSkills)
      .mockRejectedValueOnce(new Error('存在しない求人です。'));

    const user = userEvent.setup();
    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    const extractSkills = await screen.findByRole('button', {
      name: '技術スタックを見る',
    });
    await user.click(extractSkills);

    expect(extractRequiredSkills)
      .toHaveBeenLastCalledWith(
        1,
        expect.any(AbortSignal),
      );

    await screen.findByText('存在しない求人です。');

  })

  test('技術スタックのリクエストを処理中はボタンを無効にし、二重送信を防ぐ', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: 'AWS',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };
    // 非同期処理のためresolve関数を外に取り出す
    let resolveSkills: (value: string[]) => void = () => { };
    const skillsPromise = new Promise<string[]>((resolve) => {
      resolveSkills = resolve;
    })
    vi.mocked(extractRequiredSkills).mockReturnValueOnce(skillsPromise);

    const user = userEvent.setup();
    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    const extractSkills = await screen.findByRole('button', {
      name: '技術スタックを見る',
    });
    await user.click(extractSkills);

    const loadingButton = await screen.findByRole('button', {
      name: '処理中…',
    });

    expect(loadingButton).toBeDisabled();

    await user.click(extractSkills);
    expect(extractRequiredSkills).toHaveBeenCalledTimes(1);

    resolveSkills(['AWS']);
    // resolveSkillの後、Reactがstateを更新して画面を表示する処理が非同期に続く場合がある。 
    // AWSが画面に表示されるまで待つ
    expect(await screen.findByText('AWS')).toBeInTheDocument();


  })

  test('1回目の試行で失敗しても2回目で再試行できる', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };

    vi.mocked(extractRequiredSkills)
      .mockRejectedValueOnce(new Error('技術スタックの取得に失敗しました。'))
      .mockResolvedValueOnce(['AWS']);

    const user = userEvent.setup();
    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    const extractSkills = await screen.findByRole('button', {
      name: '技術スタックを見る',
    });
    await user.click(extractSkills);

    expect(await screen.findByText('技術スタックの取得に失敗しました。')).toBeInTheDocument();
    expect(extractSkills).toBeEnabled();

    await user.click(extractSkills);
    expect(await screen.findByText('AWS')).toBeInTheDocument();

    expect(extractRequiredSkills).toHaveBeenCalledTimes(2);

  })

  test('「技術スタックを見る」を押すと技術がデータに残り、追加のAPI呼び出しなしで使える', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: 'エンジニア求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };

    vi.mocked(extractRequiredSkills)
      .mockResolvedValueOnce(['AWS']);

    const user = userEvent.setup();
    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    const extractedSkills = await screen.findByRole('button', {
      name: '技術スタックを見る',
    });
    await user.click(extractedSkills);
    expect(await screen.findByText('AWS')).toBeInTheDocument();
    expect(extractRequiredSkills).toHaveBeenCalledTimes(1);

    await user.click(extractedSkills);
    expect(await screen.queryByText('AWS')).not.toBeInTheDocument();
    expect(extractRequiredSkills).toHaveBeenCalledTimes(1);

    await user.click(extractedSkills);
    expect(await screen.findByText('AWS')).toBeInTheDocument();
    expect(extractRequiredSkills).toHaveBeenCalledTimes(1);

  })

  test('originalTextが変更されると進行中のSkillsリクエストを取り消す', async() => {
    const awsRequest = deferred<string[]>();
    const javaRequest = deferred<string[]>();

    const jobPosting: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: null,
      originalText: 'AWSエンジニア求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };

    vi.mocked(extractRequiredSkills)
      .mockReturnValueOnce(awsRequest.promise)
      .mockReturnValueOnce(javaRequest.promise);

    const props = {
      isEditing: false,
      isSaving: false,
      isDeleting: false,
      isUpdatingStatus: false,
      onStartEdit: vi.fn(),
      onSave: vi.fn(),
      onCancel: vi.fn(),
      onDelete: vi.fn(),
      onApplicationStatusChange: vi.fn(),
    };

    const awsJobPosting = {
      ...jobPosting,
      originalText: 'AWSエンジニア求人'
    };

    const { rerender } = render(
      <JobPostingListItem
        {...props}
        jobPosting={awsJobPosting}
      />,
    );

    const awsSkillsButton = screen.getByRole('button', {
      name: '技術スタックを見る',
    });

    await userEvent.click(awsSkillsButton);

    const firstSignal = vi.mocked(extractRequiredSkills).mock.calls[0][1];

    const javaJobPosting = {
      ...awsJobPosting,
      originalText: 'JAVAエンジニア求人',
    };

    rerender(
      <JobPostingListItem
        {...props}
        jobPosting={javaJobPosting}
      />,
    );

    expect(firstSignal.aborted).toBe(true);

    awsRequest.reject(
      new DOMException(
        'The operation was aborted',
        'AbortError',
      ),
    );

    const javaSkillsButton = await screen.findByRole('button', {
      name: '技術スタックを見る',
    });
    expect(javaSkillsButton).toBeEnabled();

    await userEvent.click(javaSkillsButton);

    javaRequest.resolve(['Java']);

    expect(
      await screen.findByText('Java'),
    ).toBeInTheDocument();

    expect(
      screen.getByText('Java'),
    ).toBeInTheDocument();

    expect(extractRequiredSkills).toHaveBeenCalledTimes(2);
  });

})

describe('memos', () => {
  test('登録されたメモの一覧が正しく表示される。', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: 'AWSエンジニア求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };
    const mockMemo: JobPostingMemo = {
      id: 1,
      content: '面談準備中',
      createdAt: '2026-08-26T00:00:00Z',
      updatedAt: '2026-08-26T00:00:00Z',
    }
    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([mockMemo]);

    const user = userEvent.setup();
    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole('button', {
        name: 'メモを見る',
      }),
    );

    expect(getJobPostingMemos)
      .toHaveBeenLastCalledWith(
        1
      );

    expect(await screen.findByText('面談準備中')).toBeInTheDocument();
  });

  test('メモがないとき、メッセージでメモがないことを確認できる。', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: 'AWSエンジニア求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };
    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([]);

    const user = userEvent.setup();
    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole('button', {
        name: 'メモを見る',
      }),
    );

    expect(getJobPostingMemos)
      .toHaveBeenLastCalledWith(
        1
      );

    expect(await screen.findByText('登録されたメモはありません。')).toBeInTheDocument();
  });

  test('存在しない求人の場合はエラーメッセージを表示する', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };

    vi.mocked(getJobPostingMemos)
      .mockRejectedValueOnce(new Error('存在しない求人です。'));


    const user = userEvent.setup();
    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole('button', {
        name: 'メモを見る',
      }),
    );

    expect(getJobPostingMemos)
      .toHaveBeenCalledWith(
        1
      );

    expect(await screen.findByText('存在しない求人です。')).toBeInTheDocument();
    expect(screen.queryByText('登録されたメモはありません。')).not.toBeInTheDocument(); // ないはずの要素を調べるときはqueryを使う(今なければnullを返す)
  });

  test('メモを登録した後に再取得できる', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };
    const mockMemo: JobPostingMemo = {
      id: 1,
      content: '面談準備中',
      createdAt: '2026-08-26T00:00:00Z',
      updatedAt: '2026-08-26T00:00:00Z',
    }
    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([mockMemo]);

    const user = userEvent.setup();
    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );
    await user.click(
      screen.getByRole('button', { name: 'メモを見る' })
    );
    // 初回Getの完了を確認
    expect(
      await screen.findByText('登録されたメモはありません。'),
    ).toBeInTheDocument();

    const textArea = screen.getByRole('textbox', {
      name: 'メモ内容',
    });
    await user.type(textArea, '面談準備中');

    const writeMemo = await screen.findByRole('button', {
      name: '登録',
    });
    await user.click(writeMemo);

    expect(getJobPostingMemos)
      .toHaveBeenCalledTimes(2);

    expect(getJobPostingMemos)
      .toHaveBeenCalledWith(1);

    expect(await screen.findByText('面談準備中')).toBeInTheDocument();
  });

  test('メモを登録した後に削除できる。', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };
    const mockMemo: JobPostingMemo = {
      id: 1,
      content: '面談準備中',
      createdAt: '2026-08-26T00:00:00Z',
      updatedAt: '2026-08-26T00:00:00Z',
    }
    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([mockMemo])
      .mockResolvedValueOnce([]);

    const user = userEvent.setup();
    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole('button', {
        name: 'メモを見る',
      }),
    );

    const deleteMemo = await screen.findByRole('button', {
      name: 'メモを削除',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(deleteMemo);

    expect(deleteJobPostingMemo)
      .toHaveBeenCalledWith(1, 1);
    expect(getJobPostingMemos)
      .toHaveBeenCalledTimes(2);

    expect(await screen.findByText('登録されたメモはありません。')).toBeInTheDocument();
  });

  test('メモ削除の確認画面でキャンセルを押すと削除しない。', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };
    const mockMemo: JobPostingMemo = {
      id: 1,
      content: '面談準備中',
      createdAt: '2026-08-26T00:00:00Z',
      updatedAt: '2026-08-26T00:00:00Z',
    }
    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([mockMemo]);

    const user = userEvent.setup();
    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole('button', {
        name: 'メモを見る',
      }),
    );

    const deleteMemo = await screen.findByRole('button', {
      name: 'メモを削除',
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(deleteMemo);

    expect(deleteJobPostingMemo)
      .not.toHaveBeenCalled();
    expect(getJobPostingMemos)
      .toHaveBeenCalledTimes(1);

    expect(await screen.findByText('面談準備中')).toBeInTheDocument();
  });

  test(
    'メモの削除が一度失敗しても、一覧と削除ボタンを維持して再度削除できる。',
    async () => {
      const mockContent: JobPosting = {
        id: 1,
        companyName: '黄猿',
        title: 'エンジニア求人',
        sourceUrl: 'http://example.com/kizaruengineer',
        originalText: '営業部求人',
        createdAt: '2026-08-14T00:00:00Z',
        applicationStatus: 'SAVED',
        salaryMin: null,
        salaryMax: null,
        version: 0,
        applicationDeadline: null
      };

      const mockMemo: JobPostingMemo = {
        id: 1,
        content: '面談準備中',
        createdAt: '2026-08-26T00:00:00Z',
        updatedAt: '2026-08-26T00:00:00Z',
      };

      const errorMessage =
        '削除中に不明なエラーが発生しました。';

      vi.mocked(getJobPostingMemos)
        .mockResolvedValueOnce([mockMemo])
        .mockResolvedValueOnce([]);

      vi.mocked(deleteJobPostingMemo)
        .mockRejectedValueOnce(
          new Error(errorMessage),
        )
        .mockResolvedValueOnce(undefined);

      vi.spyOn(window, 'confirm')
        .mockReturnValue(true);

      const user = userEvent.setup();

      render(
        <JobPostingListItem
          jobPosting={mockContent}
          isEditing={false}
          isSaving={false}
          isDeleting={false}
          isUpdatingStatus={false}
          onStartEdit={vi.fn()}
          onSave={vi.fn()}
          onCancel={vi.fn()}
          onDelete={vi.fn()}
          onApplicationStatusChange={vi.fn()}
        />,
      );

      // 最初のメモ取得
      await user.click(
        screen.getByRole('button', {
          name: 'メモを見る',
        }),
      );

      expect(
        await screen.findByText('面談準備中'),
      ).toBeInTheDocument();

      // 一次削除失敗
      await user.click(
        screen.getByRole('button', {
          name: 'メモを削除',
        }),
      );

      expect(
        await screen.findByRole('alert'),
      ).toHaveTextContent(errorMessage);

      expect(
        screen.getByText('面談準備中'),
      ).toBeInTheDocument();

      const retryDeleteButton =
        screen.getByRole('button', {
          name: 'メモを削除',
        });

      expect(retryDeleteButton).toBeEnabled();

      // 2次削除成功
      await user.click(retryDeleteButton);

      await waitFor(() => {
        expect(deleteJobPostingMemo)
          .toHaveBeenCalledTimes(2);
      });

      expect(deleteJobPostingMemo)
        .toHaveBeenNthCalledWith(1, 1, 1);

      expect(deleteJobPostingMemo)
        .toHaveBeenNthCalledWith(2, 1, 1);

      // 削除の成功後に最新のMemo一覧を再取得
      await waitFor(() => {
        expect(getJobPostingMemos)
          .toHaveBeenCalledTimes(2);
      });

      expect(
        await screen.findByText(
          '登録されたメモはありません。',
        ),
      ).toBeInTheDocument();
    },
  );

  test('メモを編集した後に再取得し、編集した内容を表示する。', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };

    const mockMemo: JobPostingMemo = {
      id: 1,
      content: '面談準備中',
      createdAt: '2026-08-26T00:00:00Z',
      updatedAt: '2026-08-26T00:00:00Z',
    };

    const updatedMemo: JobPostingMemo = {
      ...mockMemo,
      content: '面接日程確認済み',
      updatedAt: '2026-08-30T00:00:00Z',
    };

    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([mockMemo])
      .mockResolvedValueOnce([updatedMemo]);

    vi.mocked(updateJobPostingMemo)
      .mockResolvedValueOnce(updatedMemo);

    const user = userEvent.setup();

    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole('button', {
        name: 'メモを見る',
      }),
    );

    const memoContent =
      await screen.findByText('面談準備中');

    const memoListItem =
      memoContent.closest('li');

    if (!memoListItem) {
      throw new Error('メモ一覧の要素が見つかりません。');
    }

    // withinを使う理由は、今の画面にはJobPostingの編集ボタンとMemoの編集ボタンが両方あるから。特定Memoの<li>の中だけ探したほうが安全。
    const editButton = within(memoListItem)
      .getByRole('button', {
        name: '編集',
      });

    await user.click(editButton);

    const textArea = screen.getByRole('textbox', {
      name: 'メモを編集',
    });

    await user.clear(textArea);
    await user.type(textArea, '面接日程確認済み');

    const saveButton = screen.getByRole('button', {
      name: '保存',
    });

    await user.click(saveButton);

    expect(updateJobPostingMemo)
      .toHaveBeenCalledWith(
        1,
        1,
        {
          content: '面接日程確認済み',
        },
      );

    expect(
      await screen.findByText('面接日程確認済み'),
    ).toBeInTheDocument();

    expect(getJobPostingMemos)
      .toHaveBeenCalledTimes(2);

    expect(
      screen.queryByText('面談準備中'),
    ).not.toBeInTheDocument();
  });

  test('メモの編集中にキャンセルすると編集APIを呼び出さない。', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };

    const mockMemo: JobPostingMemo = {
      id: 1,
      content: '面談準備中',
      createdAt: '2026-08-26T00:00:00Z',
      updatedAt: '2026-08-26T00:00:00Z',
    };

    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([mockMemo]);

    const user = userEvent.setup();

    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole('button', {
        name: 'メモを見る',
      }),
    );

    const memoContent =
      await screen.findByText('面談準備中');

    const memoListItem =
      memoContent.closest('li');

    if (!memoListItem) {
      throw new Error('メモ一覧の要素が見つかりません。');
    }

    const editButton = within(memoListItem)
      .getByRole('button', {
        name: '編集',
      });

    await user.click(editButton);

    const textArea = screen.getByRole('textbox', {
      name: 'メモを編集',
    });

    await user.clear(textArea);
    await user.type(textArea, '変更するつもりだった内容');

    const cancelButton = screen.getByRole('button', {
      name: 'キャンセル',
    });

    await user.click(cancelButton);

    expect(updateJobPostingMemo)
      .not.toHaveBeenCalled();

    expect(getJobPostingMemos)
      .toHaveBeenCalledTimes(1);

    expect(
      await screen.findByText('面談準備中'),
    ).toBeInTheDocument();
  });

  test('メモの編集に失敗するとエラーを表示し、編集フォームと入力内容を維持する。', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };

    const mockMemo: JobPostingMemo = {
      id: 1,
      content: '面談準備中',
      createdAt: '2026-08-26T00:00:00Z',
      updatedAt: '2026-08-26T00:00:00Z',
    };

    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([mockMemo]);

    vi.mocked(updateJobPostingMemo)
      .mockRejectedValueOnce(
        new Error('メモの編集に失敗しました。'),
      );

    const user = userEvent.setup();

    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'メモを見る',
      }),
    );

    const memoContent =
      await screen.findByText('面談準備中');

    const memoListItem =
      memoContent.closest('li');

    if (!memoListItem) {
      throw new Error('メモ一覧の要素が見つかりません。');
    }

    const editButton = within(memoListItem)
      .getByRole('button', {
        name: '編集',
      });

    await user.click(editButton);

    const textArea = within(memoListItem)
      .getByRole('textbox', {
        name: 'メモを編集',
      });

    await user.clear(textArea);
    await user.type(
      textArea,
      '面接日程を変更しました',
    );

    const saveButton = within(memoListItem)
      .getByRole('button', {
        name: '保存',
      });

    await user.click(saveButton);

    expect(updateJobPostingMemo)
      .toHaveBeenCalledWith(
        1,
        1,
        {
          content: '面接日程を変更しました',
        },
      );

    expect(
      await screen.findByText(
        'メモの編集に失敗しました。',
      ),
    ).toBeInTheDocument();

    const remainingTextArea =
      screen.getByRole('textbox', {
        name: 'メモを編集',
      });

    expect(remainingTextArea)
      .toHaveValue('面接日程を変更しました');

    expect(getJobPostingMemos)
      .toHaveBeenCalledTimes(1);
  });

  test('最初に求人が表示されるときはメモAPIを呼び出さない。', () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };
    const mockMemo: JobPostingMemo = {
      id: 1,
      content: '面談準備中',
      createdAt: '2026-08-26T00:00:00Z',
      updatedAt: '2026-08-26T00:00:00Z',
    };

    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([mockMemo]);

    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />,
    );

    expect(getJobPostingMemos)
      .not.toHaveBeenCalled();
    expect(
      screen.queryByText('面談準備中')
    ).not.toBeInTheDocument();

  });

  test('「メモを見る」を押して閉じ、また押してもGETの呼び出しは最終的に1回である', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };
    const mockMemo: JobPostingMemo = {
      id: 1,
      content: '面談準備中',
      createdAt: '2026-08-26T00:00:00Z',
      updatedAt: '2026-08-26T00:00:00Z',
    };

    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([mockMemo]);

    const user = userEvent.setup();

    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />,
    );

    const toggleButton =
      screen.getByRole('button', {
        name: 'メモを見る',
      });

    await user.click(toggleButton);
    expect(await screen.findByText('面談準備中')).toBeVisible();

    await user.click(toggleButton);
    expect(screen.getByText('面談準備中')).not.toBeVisible();

    await user.click(toggleButton);
    expect(await screen.findByText('面談準備中')).toBeVisible();

    expect(getJobPostingMemos)
      .toHaveBeenCalledTimes(1);

  });

  test('「メモを見る」を押したとき、1回目の試行で失敗しても2回目で再試行できる。', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };
    const mockMemo: JobPostingMemo = {
      id: 1,
      content: '面談準備中',
      createdAt: '2026-08-26T00:00:00Z',
      updatedAt: '2026-08-26T00:00:00Z',
    };

    vi.mocked(getJobPostingMemos)
      .mockRejectedValueOnce(new Error('メモの取得に失敗しました。'))
      .mockResolvedValueOnce([mockMemo]);

    const user = userEvent.setup();

    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />,
    );

    const toggleButton =
      screen.getByRole('button', {
        name: 'メモを見る',
      });

    await user.click(toggleButton);
    expect(await screen.findByText('メモの取得に失敗しました。')).toBeInTheDocument();

    await user.click(toggleButton);
    expect(screen.queryByText('面談準備中')).not.toBeInTheDocument();

    await user.click(toggleButton);
    expect(await screen.findByText('面談準備中')).toBeInTheDocument();

    expect(
      screen.queryByText('メモの取得に失敗しました。')
    ).not.toBeInTheDocument();

    expect(getJobPostingMemos)
      .toHaveBeenCalledTimes(2);

  });

  test('メモの切り替えでaria-expandedの状態が変わる', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };
    const mockMemo: JobPostingMemo = {
      id: 1,
      content: '面談準備中',
      createdAt: '2026-08-26T00:00:00Z',
      updatedAt: '2026-08-26T00:00:00Z',
    };

    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([mockMemo]);

    const user = userEvent.setup();

    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />,
    );

    const toggleButton =
      screen.getByRole('button', {
        name: 'メモを見る',
      });
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggleButton);
    expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

    expect(getJobPostingMemos)
      .toHaveBeenCalledTimes(1);
  });

  test('メモの切り替えボタンのaria-controlsがメモの領域を指す', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };
    const mockMemo: JobPostingMemo = {
      id: 1,
      content: '面談準備中',
      createdAt: '2026-08-26T00:00:00Z',
      updatedAt: '2026-08-26T00:00:00Z',
    };

    vi.mocked(getJobPostingMemos)
      .mockResolvedValueOnce([mockMemo]);

    const user = userEvent.setup();

    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />,
    );

    const toggleButton =
      screen.getByRole('button', {
        name: 'メモを見る',
      });
    expect(toggleButton).toHaveAttribute('aria-controls', 'job-posting-memos-1');

    const memoRegion = document.getElementById(
      'job-posting-memos-1',
    );
    if (!memoRegion) {
      throw new Error('メモの領域が見つかりません。');
    }
    expect(memoRegion).toHaveAttribute('hidden');

    await user.click(toggleButton);
    expect(memoRegion).not.toHaveAttribute('hidden');

    await user.click(toggleButton);
    expect(memoRegion).toHaveAttribute('hidden');

    expect(getJobPostingMemos)
      .toHaveBeenCalledTimes(1);
  });

  test(
    '別のメモの編集中に以前の保存リクエストが完了しても、現在の編集状態を維持する',
    async () => {
      const mockContent: JobPosting = {
        id: 1,
        companyName: '黄猿',
        title: 'エンジニア求人',
        sourceUrl: 'http://example.com/kizaruengineer',
        originalText: '営業部求人',
        createdAt: '2026-08-14T00:00:00Z',
        applicationStatus: 'SAVED',
        salaryMin: null,
        salaryMax: null,
        applicationDeadline: null,
        version: 0,
      };

      const mockMemoA: JobPostingMemo = {
        id: 1,
        content: '面談準備中',
        createdAt: '2026-08-26T00:00:00Z',
        updatedAt: '2026-08-26T00:00:00Z',
      };

      const mockMemoB: JobPostingMemo = {
        id: 2,
        content: '面接日程確認済み',
        createdAt: '2026-08-27T00:00:00Z',
        updatedAt: '2026-08-27T00:00:00Z',
      };

      const updatedMemoA: JobPostingMemo = {
        ...mockMemoA,
        content: '面談準備完了',
        updatedAt: '2026-08-30T00:00:00Z',
      };

      vi.mocked(getJobPostingMemos)
        .mockResolvedValueOnce([
          mockMemoA,
          mockMemoB,
        ])
        .mockResolvedValueOnce([
          updatedMemoA,
          mockMemoB,
        ]);

      let resolveUpdate!: (
        value: JobPostingMemo,
      ) => void;

      // Memo AのResponseを遅延させ、途中でMemo Bを編集する状況を再現する。
      const pendingUpdate =
        new Promise<JobPostingMemo>((resolve) => {
          resolveUpdate = resolve;
        });

      vi.mocked(updateJobPostingMemo)
        .mockReturnValueOnce(pendingUpdate);

      const user = userEvent.setup();

      render(
        <JobPostingListItem
          jobPosting={mockContent}
          isEditing={false}
          isSaving={false}
          isDeleting={false}
          isUpdatingStatus={false}
          onStartEdit={vi.fn()}
          onSave={vi.fn()}
          onCancel={vi.fn()}
          onDelete={vi.fn()}
          onApplicationStatusChange={vi.fn()}
        />,
      );

      await user.click(
        screen.getByRole('button', {
          name: 'メモを見る',
        }),
      );

      const memoAContent =
        await screen.findByText('面談準備中');

      const memoBContent =
        screen.getByText('面接日程確認済み');

      const memoAItem =
        memoAContent.closest('li');

      const memoBItem =
        memoBContent.closest('li');

      if (!memoAItem || !memoBItem) {
        throw new Error(
          'メモ一覧の要素が見つかりません。',
        );
      }

      // Memo Aの編集を開始する
      await user.click(
        within(memoAItem).getByRole(
          'button',
          {
            name: '編集',
          },
        ),
      );

      const memoATextArea =
        within(memoAItem).getByRole(
          'textbox',
          {
            name: 'メモを編集',
          },
        );

      await user.clear(memoATextArea);

      await user.type(
        memoATextArea,
        '面談準備完了',
      );

      // Memo Aの保存要求を開始するが、
      // Responseはまだ返さない
      await user.click(
        within(memoAItem).getByRole(
          'button',
          {
            name: '保存',
          },
        ),
      );

      expect(updateJobPostingMemo)
        .toHaveBeenCalledWith(
          1,
          1,
          {
            content: '面談準備完了',
          },
        );

      // Memo Aの保存中にMemo Bの編集を開始する
      await user.click(
        within(memoBItem).getByRole(
          'button',
          {
            name: '編集',
          },
        ),
      );

      expect(
        within(memoBItem).getByRole(
          'textbox',
          {
            name: 'メモを編集',
          },
        ),
      ).toHaveValue(
        '面接日程確認済み',
      );

      // 遅れてMemo Aの保存Responseを返す
      await act(async () => {
        resolveUpdate(updatedMemoA);
      });

      await waitFor(() => {
        expect(getJobPostingMemos)
          .toHaveBeenCalledTimes(2);
      });

      // Memo Aの保存完了によって、
      // 現在編集中のMemo Bが閉じられないことを確認する
      expect(
        screen.getByRole(
          'textbox',
          {
            name: 'メモを編集',
          },
        ),
      ).toHaveValue(
        '面接日程確認済み',
      );
    },
  );

})

describe('status', () => {
  test('応募状態の変更履歴を表示できる', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };

    const statusHistory: JobPostingStatusHistory[] = [
      {
        id: 2,
        fromStatus: 'APPLIED',
        toStatus: 'INTERVIEWING',
        changedAt: '2026-10-09T10:30:00Z',
      },
      {
        id: 1,
        fromStatus: 'SAVED',
        toStatus: 'APPLIED',
        changedAt: '2026-10-08T10:30:00Z',
      },
    ];

    vi.mocked(fetchApplicationStatusHistory)
      .mockResolvedValueOnce(statusHistory);
    
    const user = userEvent.setup();

    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: "変更履歴を表示",
      }),
    );

    expect(
      await screen.findByText("応募 → 面接"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("保存 → 応募"),
    ).toBeInTheDocument();

    expect(fetchApplicationStatusHistory)
      .toHaveBeenCalledWith(mockContent.id);
    
  });

  test('応募状態の変更履歴がない場合はメッセージを表示する', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };

    vi.mocked(fetchApplicationStatusHistory)
      .mockResolvedValueOnce([]);

    const user = userEvent.setup();

    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: "変更履歴を表示",
      }),
    );

    expect(
      await screen.findByText("変更履歴はありません。"),
    ).toBeInTheDocument();

  })

  test('応募状態の変更履歴取得に失敗した場合はエラーを表示する', async () => {
    const mockContent: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl: 'http://example.com/kizaruengineer',
      originalText: '営業部求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };

    vi.mocked(fetchApplicationStatusHistory)
      .mockRejectedValueOnce(
        new ApiError(
          "変更履歴の取得に失敗しました。",
          500,
          "INTERNAL_SERVER_ERROR",
        ),
      );
      
    const user = userEvent.setup();

    render(
      <JobPostingListItem
        jobPosting={mockContent}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    await user.click(
      screen.getByRole("button", {
        name: "変更履歴を表示",
      }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(
      "変更履歴の取得に失敗しました。",
    );
  });

  test('応募状態を変更すると表示中の変更履歴を再取得し、日本語で表示する',
    async () => {
      const statusChange = deferred<boolean>();

      const mockContent: JobPosting = {
        id: 1,
        companyName: '黄猿',
        title: 'エンジニア求人',
        sourceUrl: null,
        originalText: 'AWSエンジニア求人',
        createdAt: '2026-10-09T00:00:00Z',
        applicationStatus: 'APPLIED',
        salaryMin: null,
        salaryMax: null,
        applicationDeadline: null,
        version: 1,
      };

      const initialHistory: JobPostingStatusHistory[] = [
        {
          id: 1,
          fromStatus: 'SAVED',
          toStatus: 'APPLIED',
          changedAt: '2026-10-09T10:00:00Z',
        },
      ];

      const updatedHistory: JobPostingStatusHistory[] = [
        {
          id: 2,
          fromStatus: 'APPLIED',
          toStatus: 'INTERVIEWING',
          changedAt: '2026-10-10T10:00:00Z',
        },
        {
          id: 1,
          fromStatus: 'SAVED',
          toStatus: 'APPLIED',
          changedAt: '2026-10-09T10:00:00Z',
        },
      ];

      vi.mocked(fetchApplicationStatusHistory)
        .mockResolvedValueOnce(initialHistory)
        .mockResolvedValueOnce(updatedHistory);

      const onApplicationStatusChange = 
        vi.fn()
          .mockReturnValueOnce(statusChange.promise);

      const user = userEvent.setup();

      render(
        <JobPostingListItem
          jobPosting={mockContent}
          isEditing={false}
          isSaving={false}
          isDeleting={false}
          isUpdatingStatus={false}
          onStartEdit={vi.fn()}
          onSave={vi.fn()}
          onCancel={vi.fn()}
          onDelete={vi.fn()}
          onApplicationStatusChange={
            onApplicationStatusChange
          }
        />,
      );

      await user.click(
        screen.getByRole('button', {
          name: '変更履歴を表示',
        }),
      );

      expect(
        await screen.findByText(
          '保存 → 応募',
        ),
      ).toBeInTheDocument();

      await user.selectOptions(
        screen.getByRole('combobox', {
          name: '応募ステータス:',
        }),
        'INTERVIEWING',
      );

      expect(onApplicationStatusChange)
        .toHaveBeenCalledWith(
          1,
          'INTERVIEWING',
          1,
        );

      expect(fetchApplicationStatusHistory)
        .toHaveBeenCalledTimes(1);
      
      statusChange.resolve(true);

      await waitFor(() => {
        expect(fetchApplicationStatusHistory)
          .toHaveBeenCalledTimes(2);
      });

      expect(
        await screen.findByText(
          '応募 → 面接',
        ),
      ).toBeInTheDocument();

      expect(
        screen.getByText(
          '保存 → 応募',
        ),
      ).toBeInTheDocument();
    },
  );

  test('応募状態の変更に失敗した場合は表示中の変更履歴を再取得しない',
    async () => {

      const mockContent: JobPosting = {
        id: 1,
        companyName: '黄猿',
        title: 'エンジニア求人',
        sourceUrl: null,
        originalText: 'AWSエンジニア求人',
        createdAt: '2026-10-09T00:00:00Z',
        applicationStatus: 'APPLIED',
        salaryMin: null,
        salaryMax: null,
        applicationDeadline: null,
        version: 1,
      };

      const initialHistory: JobPostingStatusHistory[] = [
        {
          id: 1,
          fromStatus: 'SAVED',
          toStatus: 'APPLIED',
          changedAt: '2026-10-09T10:00:00Z',
        },
      ];

      vi.mocked(fetchApplicationStatusHistory)
        .mockResolvedValueOnce(initialHistory);

      const onApplicationStatusChange =
        vi.fn()
          .mockReturnValueOnce(false);

      const user = userEvent.setup();

      render(
        <JobPostingListItem
          jobPosting={mockContent}
          isEditing={false}
          isSaving={false}
          isDeleting={false}
          isUpdatingStatus={false}
          onStartEdit={vi.fn()}
          onSave={vi.fn()}
          onCancel={vi.fn()}
          onDelete={vi.fn()}
          onApplicationStatusChange={
            onApplicationStatusChange
          }
        />,
      );

      await user.click(
        screen.getByRole('button', {
          name: '変更履歴を表示',
        }),
      );

      expect(
        await screen.findByText('保存 → 応募'),
      ).toBeInTheDocument();

      expect(fetchApplicationStatusHistory)
        .toHaveBeenCalledTimes(1);

      await user.selectOptions(
        screen.getByRole('combobox', {
          name: '応募ステータス:',
        }),
        'INTERVIEWING',
      );

      await waitFor(() => {
        expect(onApplicationStatusChange)
          .toHaveBeenCalledWith(
            1,
            'INTERVIEWING',
            1,
          );
      });

      expect(fetchApplicationStatusHistory)
        .toHaveBeenCalledTimes(1);
    },
  );

  test(
    '変更履歴が閉じている場合は応募状態変更成功後も履歴を再取得しない',
    async () => {
      const mockContent: JobPosting = {
        id: 1,
        companyName: '黄猿',
        title: 'エンジニア求人',
        sourceUrl: null,
        originalText: 'AWSエンジニア求人',
        createdAt: '2026-10-09T00:00:00Z',
        applicationStatus: 'APPLIED',
        salaryMin: null,
        salaryMax: null,
        applicationDeadline: null,
        version: 1,
      };

      const onApplicationStatusChange =
        vi.fn()
          .mockResolvedValueOnce(true);

      const user = userEvent.setup();

      render(
        <JobPostingListItem
          jobPosting={mockContent}
          isEditing={false}
          isSaving={false}
          isDeleting={false}
          isUpdatingStatus={false}
          onStartEdit={vi.fn()}
          onSave={vi.fn()}
          onCancel={vi.fn()}
          onDelete={vi.fn()}
          onApplicationStatusChange={
            onApplicationStatusChange
          }
        />,
      );

      await user.selectOptions(
        screen.getByRole('combobox', {
          name: '応募ステータス:',
        }),
        'INTERVIEWING',
      );

      expect(onApplicationStatusChange)
        .toHaveBeenCalledWith(
          1,
          'INTERVIEWING',
          1,
        );

      // Promise解決後の処理まで完了させる。
      await Promise.resolve();

      expect(fetchApplicationStatusHistory)
        .not.toHaveBeenCalled();
    },
  );
})

describe('求人原文のリンク', () => {
  const renderWithSourceUrl = async (sourceUrl: string | null) => {
    const jobPosting: JobPosting = {
      id: 1,
      companyName: '黄猿',
      title: 'エンジニア求人',
      sourceUrl,
      originalText: 'AWSエンジニア求人',
      createdAt: '2026-08-14T00:00:00Z',
      applicationStatus: 'SAVED',
      salaryMin: null,
      salaryMax: null,
      applicationDeadline: null,
      version: 0,
    };

    render(
      <JobPostingListItem
        jobPosting={jobPosting}
        isEditing={false}
        isSaving={false}
        isDeleting={false}
        isUpdatingStatus={false}
        onStartEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onApplicationStatusChange={vi.fn()}
      />
    );

    await screen.findByRole('button', { name: '技術スタックを見る' });
  };

  test('httpとhttpsのURLは新しいタブで開くリンクとして表示する', async () => {
    await renderWithSourceUrl('https://example.com/jobs/1');

    const link = screen.getByRole('link', { name: '原文を見る' });
    expect(link).toHaveAttribute('href', 'https://example.com/jobs/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  // 検証を導入する前に保存された値が、DBに残っている場合。
  test.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'www.example.com',
    'ftp://example.com/x',
  ])('保存された値が%sならリンクを表示しない', async (sourceUrl) => {
    await renderWithSourceUrl(sourceUrl);

    expect(screen.queryByRole('link', { name: '原文を見る' })).not.toBeInTheDocument();
    expect(screen.getByText('AWSエンジニア求人')).toBeInTheDocument();
  });

  test('URLがなければリンクを表示しない', async () => {
    await renderWithSourceUrl(null);

    expect(screen.queryByRole('link', { name: '原文を見る' })).not.toBeInTheDocument();
  });
});
