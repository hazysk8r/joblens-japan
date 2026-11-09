import { act, cleanup, render, screen, waitFor, within, } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, vi, test, expect, describe, } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import { ApiError } from '../api/apiError';
import { fetchApplicationStatusSummary, fetchJobPostings, deleteJobPosting, updateJobPosting, createJobPosting, updateApplicationStatus } from '../api/jobPostingApi';
import type { JobPosting, PageResponse } from '../types/jobPosting';

// 以前のMock呼び出し履歴を削除
beforeEach(() => {
  vi.clearAllMocks();
});
// render()が作ったReact DOMを削除
afterEach(() => {
  cleanup();
});

vi.mock('../api/jobPostingApi');

const renderApp = (initialEntry = '/') => {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthenticatedApp />
    </MemoryRouter>
  );
};

const mockPage = {
  content: [],
  page: 0,
  size: 5,
  totalElements: 0,
  totalPages: 2,
  first: true,
  last: false,
};

const mockSummary = {
  saved: 0,
  applied: 0,
  interviewing: 0,
  offered: 0,
  rejected: 0,
};

// 非同期リクエストの完了順をテスト側で制御する。
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}


vi.mocked(fetchJobPostings).mockResolvedValue(mockPage);
vi.mocked(fetchApplicationStatusSummary).mockResolvedValue(mockSummary);

test('並び替えのselectが表示される', async () => {
  const user = userEvent.setup();
  renderApp();

  await user.click(
    screen.getByRole('button', {
      name: '＋ 詳細条件',
    }),
  );

  const sortingSelect = screen.getByRole('combobox', {
    name: '並び替え',
  });

  expect(sortingSelect).toBeDefined();
});

test('会社名順を選ぶと、その並び順で再取得する', async () => {
  const user = userEvent.setup();

  renderApp();

  await user.click(
    screen.getByRole('button', {
      name: '＋ 詳細条件',
    }),
  );

  const sortingSelect = screen.getByRole('combobox', {
    name: '並び替え',
  });

  await user.selectOptions(
    sortingSelect,
    'companyName,asc',
  );

  expect(fetchJobPostings)
    .toHaveBeenLastCalledWith(
      '',
      '',
      0,
      'companyName,asc',
      null,
      null,
      null,
      null,
    );
});

test('検索条件を維持したまま会社名順に並び替える', async () => {
  const user = userEvent.setup();
  renderApp();

  await user.click(
    screen.getByRole('button', {
      name: '＋ 詳細条件',
    }),
  );

  const keywordInput = screen.getByRole('textbox', {
    name: '検索キーワード',
  });
  const statusSelect = screen.getByRole('combobox', {
    name: 'ステータス',
  });
  const sortingSelect = screen.getByRole('combobox', {
    name: '並び替え',
  });

  const searchButton = await screen.findByRole('button', {
    name: '検索',
  });

  await user.type(keywordInput, 'AWS');

  await user.selectOptions(statusSelect, 'APPLIED');

  await user.click(searchButton);

  await user.selectOptions(sortingSelect, 'companyName,asc');

  expect(fetchJobPostings)
    .toHaveBeenLastCalledWith(
      'AWS',
      'APPLIED',
      0,
      'companyName,asc',
      null,
      null,
      null,
      null,
    );
});

test('現在の並び順がページを移動しても維持される', async () => {
  const user = userEvent.setup();
  renderApp();

  await user.click(
    screen.getByRole('button', {
      name: '＋ 詳細条件',
    }),
  );

  const sortingSelect = screen.getByRole('combobox', {
    name: '並び替え',
  });
  const nextPageButton = await screen.findByRole('button', {
    name: '次へ',
  });

  await user.selectOptions(sortingSelect, 'companyName,asc');

  await waitFor(() => {
    expect(
      (nextPageButton as HTMLButtonElement).disabled
    ).toBe(false);
  });

  await user.click(nextPageButton);

  expect(fetchJobPostings)
    .toHaveBeenLastCalledWith(
      '',
      '',
      1,
      'companyName,asc',
      null,
      null,
      null,
      null,
    );

});

test('ユーザーが選んだ並び順を維持したまま次のページへ進み、前のページへ戻れる', async () => {
  const firstPage = {
    ...mockPage,
    page: 0,
    first: true,
    last: false,
  };
  const secondPage = {
    ...mockPage,
    page: 1,
    first: false,
    last: true,
  };

  vi.mocked(fetchJobPostings)
    .mockResolvedValueOnce(firstPage)
    .mockResolvedValueOnce(firstPage)
    .mockResolvedValueOnce(secondPage)
    .mockResolvedValueOnce(firstPage);


  const user = userEvent.setup();
  renderApp();

  await user.click(
    screen.getByRole('button', {
      name: '＋ 詳細条件',
    }),
  );

  const sortingSelect = screen.getByRole('combobox', {
    name: '並び替え',
  });
  await user.selectOptions(sortingSelect, 'companyName,asc');

  const nextPageButton = await screen.findByRole('button', {
    name: '次へ',
  });
  await waitFor(() => {
    expect(
      (nextPageButton as HTMLButtonElement).disabled
    ).toBe(false);
  });
  await user.click(nextPageButton);

  const previousPageButton = await screen.findByRole('button', {
    name: '前へ',
  });
  await waitFor(() => {
    expect(
      (previousPageButton as HTMLButtonElement).disabled
    ).toBe(false);
  });
  await user.click(previousPageButton);

  expect(fetchJobPostings)
    .toHaveBeenLastCalledWith(
      '',
      '',
      0,
      'companyName,asc',
      null,
      null,
      null,
      null,
    );

});

test('現在のページが範囲を超えたら、最後の有効なページを再取得する', async () => {
  const mockContent: JobPosting = {
    id: 0,
    companyName: '黄猿',
    title: 'エンジニア求人',
    sourceUrl: 'http://example.com/kizaruengineer',
    originalText: 'AWSエンジニア求人',
    createdAt: '2026-08-14T00:00:00Z',
    applicationStatus: 'APPLIED',
    salaryMin: null,
    salaryMax: null,
    applicationDeadline: null,
    version: 0,
  };

  const firstPage = {
    ...mockPage,
    page: 0,
    totalPages: 3,
    first: true,
    last: false,
  };

  const secondPage = {
    ...mockPage,
    page: 1,
    totalPages: 3,
    first: false,
    last: false,
  };

  const thirdPage = {
    ...mockPage,
    page: 2,
    totalPages: 3,
    first: false,
    last: true,
    content: [mockContent],
  };

  const outOfRangePage = {
    ...mockPage,
    page: 2,
    totalPages: 2,
    content: [],
  };

  const correctPage = {
    ...mockPage,
    page: 1,
    totalPages: 2,
    first: false,
    last: true,
    content: [mockContent],
  };

  vi.mocked(fetchJobPostings)
    .mockResolvedValueOnce(firstPage)
    .mockResolvedValueOnce(secondPage)
    .mockResolvedValueOnce(thirdPage)
    .mockResolvedValueOnce(outOfRangePage)
    .mockResolvedValueOnce(correctPage);

  const user = userEvent.setup();
  renderApp();

  const nextPageButton = await screen.findByRole('button', {
    name: '次へ',
  });

  await waitFor(() => {
    expect(
      (nextPageButton as HTMLButtonElement).disabled
    ).toBe(false);
  });
  await user.click(nextPageButton);
  await waitFor(() => {
    expect(
      (nextPageButton as HTMLButtonElement).disabled
    ).toBe(false);
  });
  await user.click(nextPageButton);

  expect(
    screen.getByText('3 / 3')
  ).toBeDefined();

  const jobPostingItem = screen.getByRole('listitem');

  const applicationStatusSelect =
    within(jobPostingItem).getByRole('combobox', {
      name: /応募ステータス/,
    });

  await user.selectOptions(
    applicationStatusSelect,
    'SAVED',
  );

  await waitFor(() => {
    expect(fetchJobPostings)
      .toHaveBeenLastCalledWith(
        '',
        '',
        1, // 最後の有効なページ
        'createdAt,desc',
        null,
        null,
        null,
        null,
      );
  });

  expect(
    screen.getByText('2 / 2')
  ).toBeDefined();

});

test('特定の並び順で削除しても、ユーザーが選んだ並び順を維持できる', async () => {
  const mockContent: JobPosting = {
    id: 0,
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

  const pageWithContent = {
    ...mockPage,
    content: [mockContent],
    totalElements: 1,
  };

  vi.mocked(fetchJobPostings)
    .mockResolvedValueOnce(pageWithContent)
    .mockResolvedValueOnce(pageWithContent);

  const user = userEvent.setup();
  renderApp();

  await user.click(
    screen.getByRole('button', {
      name: '＋ 詳細条件',
    }),
  );

  const sortingSelect = screen.getByRole('combobox', {
    name: '並び替え',
  });
  await user.selectOptions(sortingSelect, 'companyName,asc');

  const deleteButton = await screen.findByRole('button', {
    name: '削除'
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await user.click(deleteButton);


  expect(deleteJobPosting)
    .toHaveBeenLastCalledWith(0);

  await waitFor(() => {
    expect(fetchJobPostings)
      .toHaveBeenLastCalledWith(
        '',
        '',
        0,
        'companyName,asc',
        null,
        null,
        null,
        null,
      );
  });

});



test('特定の並び順で編集しても、ユーザーが選んだ並び順を維持できる', async () => {
  const mockContent: JobPosting = {
    id: 0,
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

  const pageWithContent = {
    ...mockPage,
    content: [mockContent],
    totalElements: 1,
  };

  vi.mocked(fetchJobPostings)
    .mockResolvedValueOnce(pageWithContent)
    .mockResolvedValueOnce(pageWithContent);

  const user = userEvent.setup();
  renderApp();

  await user.click(
    screen.getByRole('button', {
      name: '＋ 詳細条件',
    }),
  );

  const sortingSelect = screen.getByRole('combobox', {
    name: '並び替え',
  });
  await user.selectOptions(sortingSelect, 'companyName,asc');

  const updateButton = await screen.findByRole('button', {
    name: '編集'
  });
  await user.click(updateButton);

  const jobPostingItem = screen.getByRole('listitem');

  const titleInput = within(jobPostingItem).getByRole('textbox', {
    name: '求人タイトル',
  });

  await user.clear(titleInput);
  await user.type(titleInput, 'クラウドエンジニア求人');

  const saveButton = screen.getByRole('button', {
    name: '保存',
  });

  await user.click(saveButton);


  await waitFor(() => {
    expect(updateJobPosting)
      .toHaveBeenCalledWith(
        0,
        {
          companyName: '黄猿',
          title: 'クラウドエンジニア求人',
          sourceUrl: 'http://example.com/kizaruengineer',
          originalText: 'AWSエンジニア求人',
          salaryMin: null,
          salaryMax: null,
          applicationDeadline: null,
        },
        0,
      );
  });
  await waitFor(() => {
    expect(fetchJobPostings)
      .toHaveBeenLastCalledWith(
        '',
        '',
        0,
        'companyName,asc',
        null,
        null,
        null,
        null,
      );
  });
});

test('検索キーワードやフィルターが適用された状態でJobLens Japanを押すと、最初のページと既定の並び順に戻る', async () => {
  const mockContent: JobPosting = {
    id: 0,
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

  const pageWithContent = {
    ...mockPage,
    content: [mockContent],
    totalElements: 1,
  };

  const firstPage = {
    ...mockPage,
    page: 0,
    first: true,
    last: false,
  };
  const secondPage = {
    ...mockPage,
    page: 1,
    first: false,
    last: true,
  };

  vi.mocked(fetchJobPostings).mockResolvedValue(pageWithContent);
  vi.mocked(fetchJobPostings)
    .mockResolvedValueOnce(firstPage) //初回render
    .mockResolvedValueOnce(firstPage) //検索
    .mockResolvedValueOnce(firstPage) //並び順の変更
    .mockResolvedValueOnce(secondPage); //次のページ

  const user = userEvent.setup();
  renderApp();

  await user.click(
    screen.getByRole('button', {
      name: '＋ 詳細条件',
    }),
  );

  const keywordInput = screen.getByRole('textbox', {
    name: '検索キーワード',
  });
  const statusSelect = screen.getByRole('combobox', {
    name: 'ステータス',
  });
  const sortingSelect = screen.getByRole('combobox', {
    name: '並び替え',
  });

  const searchButton = await screen.findByRole('button', {
    name: '検索',
  });

  const goBackToHome = await screen.findByRole('button', {
    name: 'JobLens Japan'
  })

  await user.type(keywordInput, 'AWS');

  await user.selectOptions(statusSelect, 'APPLIED');

  await user.click(searchButton);

  await user.selectOptions(sortingSelect, 'companyName,asc');

  const nextPageButton = await screen.findByRole('button', {
    name: '次へ',
  });
  await waitFor(() => {
    expect(
      (nextPageButton as HTMLButtonElement).disabled
    ).toBe(false);
  });
  await user.click(nextPageButton);

  await user.click(goBackToHome);

  await waitFor(() => {
    expect(fetchJobPostings)
      .toHaveBeenLastCalledWith(
        '',
        '',
        0,
        'createdAt,desc',
        null,
        null,
        null,
        null,
      );
  });
});

test('月給の範囲を選んで検索すると、salaryMinとsalaryMaxを渡す', async () => {
  const user = userEvent.setup();

  renderApp();

  await user.click(
    screen.getByRole('button', {
      name: '＋ 詳細条件',
    }),
  );

  const salaryMinSelect = screen.getByLabelText(
    '最低月給',
    { selector: '#search-salaryMin' },
  );

  const salaryMaxSelect = screen.getByLabelText(
    '最高月給',
    { selector: '#search-salaryMax' },
  );

  const searchButton = await screen.findByRole(
    'button',
    { name: '検索' },
  );

  await user.selectOptions(
    salaryMinSelect,
    '300000',
  );

  await user.selectOptions(
    salaryMaxSelect,
    '500000',
  );

  await user.click(searchButton);

  expect(fetchJobPostings)
    .toHaveBeenLastCalledWith(
      '',
      '',
      0,
      'createdAt,desc',
      300000,
      500000,
      null,
      null,
    );
});

test('最低月給より低い最高月給は選択できない', async () => {
  const user = userEvent.setup();

  renderApp();

  await user.click(
    screen.getByRole('button', {
      name: '＋ 詳細条件',
    }),
  );

  const salaryMinSelect = screen.getByLabelText(
    '最低月給',
    { selector: '#search-salaryMin' },
  );

  const salaryMaxSelect = screen.getByLabelText(
    '最高月給',
    { selector: '#search-salaryMax' },
  );

  await user.selectOptions(
    salaryMinSelect,
    '400000',
  );

  const invalidOption = within(
    salaryMaxSelect,
  ).getByRole('option', {
    name: '350,000円',
  });

  expect(
    (invalidOption as HTMLOptionElement).disabled,
  ).toBe(true);
});

test('月給の範囲を含めて求人を登録できる', async () => {
  const user = userEvent.setup();

  renderApp('/job-postings/new')

  await user.type(
    screen.getByRole('textbox', {
      name: '求人タイトル',
    }),
    'クラウドエンジニア',
  );

  await user.type(
    screen.getByRole('textbox', {
      name: '求人原文',
    }),
    'AWS Java',
  );

  const salaryMinSelect = screen.getByLabelText(
    '最低月給',
    { selector: '#create-salaryMin' },
  );

  const salaryMaxSelect = screen.getByLabelText(
    '最高月給',
    { selector: '#create-salaryMax' },
  );

  await user.selectOptions(
    salaryMinSelect,
    '300000',
  );

  await user.selectOptions(
    salaryMaxSelect,
    '500000',
  );

  const createSection = screen
    .getByRole('heading', {
      name: '求人登録',
    })
    .closest('section');

  if (!createSection) {
    throw new Error('求人登録の領域が見つかりません。');
  }

  const createButton = within(createSection)
    .getByRole('button', {
      name: '登録',
    });

  await user.click(createButton);

  await waitFor(() => {
    expect(createJobPosting)
      .toHaveBeenCalledWith({
        companyName: null,
        title: 'クラウドエンジニア',
        sourceUrl: null,
        originalText: 'AWS Java',
        salaryMin: 300000,
        salaryMax: 500000,
        applicationDeadline: null,
      });
  });
});

test('ホームで「求人を登録する」リンクを押すと、求人登録ページへ移動する', async () => {
  const user = userEvent.setup();

  renderApp();

  const createJobPostingLink =
    await screen.findByRole('link', {
      name: /求人を登録する/,
    });

  await user.click(createJobPostingLink);

  const createPageHeading =
    await screen.findByRole('heading', {
      name: '求人登録',
    });

  expect(createPageHeading).toBeDefined();

  const createFormHeading =
    screen.getByRole('heading', {
      name: '求人登録',
    });

  expect(createFormHeading).toBeDefined();
});

test('古い一覧の応答が最新の並び替え結果を上書きしない', async () => {

  const firstSortRequest = deferred<PageResponse<JobPosting>>();
  const secondSortRequest = deferred<PageResponse<JobPosting>>();
  
  const initialPage: PageResponse<JobPosting> = {
    ...mockPage,
    totalPages: 1,
    last: true,
  };

  const olderResponseJob: JobPosting = {
    id: 1,
    companyName: 'Old Company',
    title: '古いソート結果',
    sourceUrl: null,
    originalText: 'old response',
    createdAt: '2026-10-01T00:00:00Z',
    applicationStatus: 'SAVED',
    salaryMin: null,
    salaryMax: null,
    applicationDeadline: null,
    version: 0,
  };

  const latestResponseJob: JobPosting = {
    ...olderResponseJob,
    id: 2,
    companyName: 'Latest Company',
    title: '最新ソート結果',
    originalText: 'latest response',
  };

  vi.mocked(fetchJobPostings)
    .mockResolvedValueOnce(initialPage)
    .mockReturnValueOnce(firstSortRequest.promise)
    .mockReturnValueOnce(secondSortRequest.promise);

  const user = userEvent.setup();

  renderApp();

  await screen.findByRole('button', {
    name: '検索',
  });

  await user.click(
    screen.getByRole('button', {
      name: '＋ 詳細条件',
    }),
  );

  const sortingSelect = 
    screen.getByRole('combobox', {
      name: '並び替え',
    });

  await user.selectOptions(
    sortingSelect,
    'companyName,asc',
  );

  await user.selectOptions(
    sortingSelect,
    'createdAt,asc',
  );

  // 最新のリクエストBを先に完了させる。
  await act(async () => {
    secondSortRequest.resolve({
      ...initialPage,
      content: [latestResponseJob],
      totalElements: 1,
    });
  });

  expect(
    await screen.findByText('最新ソート結果'),
  ).toBeInTheDocument();

  await act(async () => {
    firstSortRequest.resolve({
      ...initialPage,
      content: [olderResponseJob],
      totalElements: 1,
    });
  });

  await waitFor(() => {
    expect(
      screen.getByText('最新ソート結果'),
    ).toBeInTheDocument();
  });

  expect(
    screen.queryByText('古いソート結果'),
  ).not.toBeInTheDocument();

});

test('古い一覧リクエストのエラーが最新の並び替え結果の画面に表示されない', async () => {

  const firstSortRequest = deferred<PageResponse<JobPosting>>();
  const secondSortRequest = deferred<PageResponse<JobPosting>>();

  const initialPage: PageResponse<JobPosting> = {
    ...mockPage,
    totalPages: 1,
    last: true,
  }

  const latestResponseJob: JobPosting = {
    id: 2,
    companyName: 'Latest Company',
    title: '最新ソート結果',
    sourceUrl: null,
    originalText: 'latest response',
    createdAt: '2026-10-01T00:00:00Z',
    applicationStatus: 'SAVED',
    salaryMin: null,
    salaryMax: null,
    applicationDeadline: null,
    version: 0,
  };

  vi.mocked(fetchJobPostings)
    .mockResolvedValueOnce(initialPage)
    .mockReturnValueOnce(firstSortRequest.promise)
    .mockReturnValueOnce(secondSortRequest.promise)
  
  const user = userEvent.setup();

  renderApp();

  await screen.findByRole('button', {
    name: '検索',
  });

  await user.click(
    screen.getByRole('button', {
      name: '＋ 詳細条件',
    }),
  );

  const sortingSelect = 
    screen.getByRole('combobox', {
      name: '並び替え',
    });

  await user.selectOptions(
    sortingSelect,
    'companyName,asc',
  );

  await user.selectOptions(
    sortingSelect,
    'createdAt,asc',
  );

  await act(async () => {
    secondSortRequest.resolve({
      ...initialPage,
      content: [latestResponseJob],
      totalElements: 1,
    });
  });

  expect(
    await screen.findByText('最新ソート結果'),
  ).toBeInTheDocument();

  await act(async () => {
    firstSortRequest.reject(
      new Error('古いリクエストのエラー'),
    );
  });

  await waitFor(() => {
    expect(
      screen.getByText('最新ソート結果'),
    ).toBeInTheDocument();
  });

  expect(
    screen.queryByText('古いリクエストのエラー'),
  ).not.toBeInTheDocument();

})

describe('URL Query State', () => {
  // MemoryRouter内の現在のURLをテストから確認できるように表示する。
  function LocationDisplay() {
    const location = useLocation();

    return (
      <div data-testid="location">
        {location.pathname}
        {location.search}
      </div>
    );
  }

  function HistoryControls() {
    const navigate = useNavigate();

    return (
      <>
        <button
          type="button"
          onClick={() => navigate(-1)}
        >
          戻る
        </button>

        <button
          type="button"
          onClick={() => navigate(1)}
        >
          進む
        </button>
      </>
    );
  }

  const renderAppWithLocation = (
    initialEntry = '/',
  ) => {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <AuthenticatedApp />
        <LocationDisplay />
        <HistoryControls />
      </MemoryRouter>,
    );
  };

  test(
    'URLの検索条件から検索状態と一覧を復元する',
    async () => {
      renderApp(
        '/?keyword=Java&status=APPLIED&page=2',
      );

      const keywordInput = screen.getByRole(
        'textbox',
        {
          name: '検索キーワード',
        },
      );



      const statusSelect = screen.getByRole(
        'combobox',
        {
          name: 'ステータス',
        },
      );

      // URLのkeywordが検索入力欄に復元されるのことを確認
      expect(keywordInput).toHaveValue('Java');

      // URLのstatusが状態選択値に復元されるのことを確認
      expect(statusSelect).toHaveValue('APPLIED');

      // 実際の一覧取得もURLに確定された検索条件を使用するべきだ。
      await waitFor(() => {
        expect(fetchJobPostings)
          .toHaveBeenCalledWith(
            'Java',
            'APPLIED',
            2,
            'createdAt,desc',
            null,
            null,
            null,
            null,
          );
      });
    },
  );

  test(
    '検索を実行すると、検索条件をURLに反映してpageを0に初期化する',
    async () => {
      const user = userEvent.setup();

      renderAppWithLocation(
        '/?keyword=AWS&status=SAVED&page=2',
      );

      const keywordInput = screen.getByRole(
        'textbox',
        {
          name: '検索キーワード',
        },
      );

      const statusSelect = screen.getByRole(
        'combobox',
        {
          name: 'ステータス',
        },
      );

      await user.click(
        screen.getByRole('button', {
          name: '＋ 詳細条件',
        }),
      );

      await user.clear(keywordInput);
      await user.type(keywordInput, 'Java');
      await user.selectOptions(statusSelect, 'APPLIED');

      const searchButton = await screen.findByRole('button', {
        name: '検索',
      });

      await user.click(searchButton);


      await waitFor(() => {
        expect(
          screen.getByTestId('location'),
        ).toHaveTextContent(
          '/?keyword=Java&status=APPLIED',
        );
      });
    },
  );

  test(
    '次のページへ移動すると、pageをURLに反映する',
    async () => {
      const user = userEvent.setup();

      vi.mocked(fetchJobPostings)
        .mockResolvedValueOnce({
          content: [],
          page: 0,
          size: 5,
          totalElements: 0,
          totalPages: 2,
          first: true,
          last: false,
        });

      renderAppWithLocation(
        '/?keyword=Java&status=APPLIED',
      );

      const nextPageButton =
        await screen.findByRole(
          'button',
          {
            name: '次へ',
          },
        );

      await waitFor(() => {
        expect(
          (nextPageButton as HTMLButtonElement)
            .disabled,
        ).toBe(false);
      });

      await user.click(nextPageButton);

      await waitFor(() => {
        expect(
          screen.getByTestId('location')
            .textContent,
        ).toBe(
          '/?keyword=Java&status=APPLIED&page=1',
        );
      });
    },
  );

  test(
    '最初のページに戻ると、URLからpageパラメーターを削除する',
    async () => {
      const user = userEvent.setup();

      vi.mocked(fetchJobPostings)
        .mockResolvedValueOnce({
          content: [],
          page: 1,
          size: 5,
          totalElements: 0,
          totalPages: 3,
          first: false,
          last: false,
        })
        .mockResolvedValueOnce({
          content: [],
          page: 0,
          size: 5,
          totalElements: 0,
          totalPages: 3,
          first: true,
          last: false,
        });

      renderAppWithLocation(
        '/?keyword=Java&status=APPLIED&page=1',
      );

      const previousPageButton =
        await screen.findByRole(
          'button',
          {
            name: '前へ',
          },
        );

      await waitFor(() => {
        expect(
          (previousPageButton as HTMLButtonElement)
            .disabled,
        ).toBe(false);
      });

      await user.click(previousPageButton);

      await waitFor(() => {
        expect(
          screen.getByTestId('location')
            .textContent,
        ).toBe(
          '/?keyword=Java&status=APPLIED',
        );
      });
    },
  );

  test(
    '戻るとき、前のURLの検索条件と一覧を復元する',
    async () => {
      const user = userEvent.setup();

      renderAppWithLocation(
        '/?keyword=AWS&status=SAVED',
      );

      const keywordInput = screen.getByRole(
        'textbox',
        {
          name: '検索キーワード',
        },
      );

      const statusSelect = screen.getByRole(
        'combobox',
        {
          name: 'ステータス',
        },
      );

      // 最初のURL状態確認
      expect(keywordInput).toHaveValue('AWS');
      expect(statusSelect).toHaveValue('SAVED');

      // 新しい検索条件入力
      await user.clear(keywordInput);
      await user.type(
        keywordInput,
        'Java',
      );

      await user.selectOptions(
        statusSelect,
        'APPLIED',
      );

      await user.click(
        screen.getByRole(
          'button',
          {
            name: '検索',
          },
        ),
      );

      // 新しいURLに移動したかを確認
      await waitFor(() => {
        expect(
          screen.getByTestId('location')
            .textContent,
        ).toBe(
          '/?keyword=Java&status=APPLIED',
        );
      });

      await user.click(
        screen.getByRole(
          'button',
          {
            name: '戻る',
          },
        ),
      );

      // URLが以前検索条件に復元
      await waitFor(() => {
        expect(
          screen.getByTestId('location')
            .textContent,
        ).toBe(
          '/?keyword=AWS&status=SAVED',
        );
      });

      // 戻る操作後、検索フォームも以前のURLの条件に復元されることを確認する。
      await waitFor(() => {
        expect(keywordInput)
          .toHaveValue('AWS');

        expect(statusSelect)
          .toHaveValue('SAVED');
      });

      await waitFor(() => {
        expect(fetchJobPostings)
          .toHaveBeenLastCalledWith(
            'AWS',
            'SAVED',
            0,
            'createdAt,desc',
            null,
            null,
            null,
            null,
          );
      });
    },
  );

  test(
    '不正なstatusとpageのQueryは既定値として処理する',
    async () => {
      renderAppWithLocation(
        '/?keyword=Java&status=UNKNOWN&page=abc',
      );

      const keywordInput = screen.getByRole(
        'textbox',
        {
          name: '検索キーワード',
        },
      );

      const statusSelect = screen.getByRole(
        'combobox',
        {
          name: 'ステータス',
        },
      );

      // 正常なkeywordはそのままに復元する。
      expect(keywordInput).toHaveValue('Java');

      // 非正常なstatusは"全体"に処理する。
      expect(statusSelect).toHaveValue('');

      // 無効なページは初期ページ（0）として処理し、照会すること。
      await waitFor(() => {
        expect(fetchJobPostings)
          .toHaveBeenCalledWith(
            'Java',
            '',
            0,
            'createdAt,desc',
            null,
            null,
            null,
            null,
          );
      });
    },
  );

  test(
    'Joblensのロゴを押してホームに戻ると、URLのQueryパラメーターを初期化する',
    async () => {
      const user = userEvent.setup();

      renderAppWithLocation(
        '/?keyword=Java&status=APPLIED&page=2'
      );

      const goBackToHome = await screen.findByRole('button', {
        name: 'JobLens Japan'
      });

      await user.click(goBackToHome);

      await waitFor(() => {
        expect(
          screen.getByTestId('location')
            .textContent,
        ).toBe(
          '/'
        );
      });
    },
  );

  test(
    '検索結果が0件のとき、追加のfetchを行わない',
    async () => {
      vi.mocked(fetchJobPostings)
        .mockResolvedValueOnce({
          content: [],
          page: 2,
          size: 5,
          totalElements: 0,
          totalPages: 0,
          first: false,
          last: true,
        });

      renderAppWithLocation('/?page=2');

      await waitFor(() => {
        expect(fetchJobPostings)
          .toHaveBeenCalled();
      });

      expect(fetchJobPostings)
        .toHaveBeenCalledTimes(1);

      // 最初のリクエストがpage=2で行われたことを確認する。
      expect(fetchJobPostings)
        .toHaveBeenCalledWith(
          '',
          '',
          2,
          'createdAt,desc',
          null,
          null,
          null,
          null,
        );
    },
  );

  test('応募締切日の範囲を選んで検索すると、deadlineFromとdeadlineToを渡す', async () => {
    const user = userEvent.setup();

    renderApp();

    await user.click(
      screen.getByRole('button', {
        name: '＋ 詳細条件',
      }),
    );

    const deadlineFromInput = screen.getByLabelText(
      '締切日（以降）'
    );
    const deadlineToInput= screen.getByLabelText(
      '締切日（以前）'
    );

    const searchButton = await screen.findByRole(
      'button',
      { name: '検索' },
    );

    await user.type(
      deadlineFromInput,
      '2026-10-01',
    );

    await user.type(
      deadlineToInput,
      '2026-10-31',
    );

    await user.click(searchButton);

    expect(fetchJobPostings)
      .toHaveBeenLastCalledWith(
        '',
        '',
        0,
        'createdAt,desc',
        null,
        null,
        '2026-10-01',
        '2026-10-31',
      );
  });

});

test('「詳細条件」ボタンを押すと詳細な検索条件が表示される', async () => {
  const user = userEvent.setup();

  renderApp();

  expect(
    screen.queryByLabelText('締切日（以前）'),
  ).toBeNull();

  await user.click(
    screen.getByRole('button', {
      name: '＋ 詳細条件',
    }),
  );

  expect(
    screen.getByLabelText('締切日（以前）'),
  ).toBeDefined();
});

test('versionが一致しないとき、stale draftを破棄して最新データで編集し直す', async () => {
  const staleJobPosting: JobPosting = {
    id: 1,
    companyName: '札幌クラウド',
    title: 'AWSエンジニア',
    sourceUrl: null,
    originalText: 'AWS求人',
    createdAt: '2026-10-05T00:00:00Z',
    applicationStatus: 'SAVED',
    salaryMin: 300000,
    salaryMax: 500000,
    applicationDeadline: null,
    version: 3,
  };
  const latestJobPosting: JobPosting = {
    ...staleJobPosting,
    title: 'AWSクラウドエンジニア',
    originalText: '最新のAWS求人',
    salaryMin: 400000,
    version: 5,
  };
  const initialPage = {
    ...mockPage,
    content: [staleJobPosting],
    totalElements: 1,
    totalPages: 1,
    first: true,
    last: true,
  };

  vi.mocked(fetchJobPostings)
    .mockResolvedValueOnce(initialPage)
    .mockResolvedValueOnce({
      ...initialPage,
      content: [latestJobPosting],
    });
  vi.mocked(updateJobPosting).mockRejectedValueOnce(
    new ApiError(
      'JobPosting version conflict',
      412,
      'JOB_POSTING_VERSION_CONFLICT',
    ),
  );

  const user = userEvent.setup();
  renderApp();
  await user.click(await screen.findByRole('button', { name: '編集' }));
  const titleInput = screen.getByRole('textbox', { name: '求人タイトル' });
  await user.clear(titleInput);
  await user.type(titleInput, '自分が修正したタイトル');
  await user.click(screen.getByRole('button', { name: '保存' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '別の画面で求人が編集されました。',
  );
  expect(await screen.findByRole('heading', {
    name: latestJobPosting.title,
    level: 2,
  })).toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: '求人タイトル' })).not.toBeInTheDocument();
  expect(updateJobPosting).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole('button', { name: '編集' }));
  expect(screen.getByRole('textbox', { name: '求人タイトル' }))
    .toHaveValue(latestJobPosting.title);
  expect(screen.getByRole('textbox', { name: '求人原文' }))
    .toHaveValue(latestJobPosting.originalText);
  expect(screen.getByRole('combobox', { name: '最低月給' }))
    .toHaveValue(String(latestJobPosting.salaryMin));
  await user.click(screen.getByRole('button', { name: '保存' }));
  expect(updateJobPosting).toHaveBeenLastCalledWith(
    1,
    expect.objectContaining({
      title: latestJobPosting.title,
      originalText: latestJobPosting.originalText,
      salaryMin: latestJobPosting.salaryMin,
    }),
    latestJobPosting.version,
  );
});
test('Statusの変更中にversionの不一致が起きたら案内messageを表示し、最新の求人を再取得する', async () => {
  const staleJobPosting: JobPosting = {
    id: 1,
    companyName: '札幌クラウド',
    title: 'AWSエンジニア',
    sourceUrl: null,
    originalText: 'AWS求人',
    createdAt: '2026-10-05T00:00:00Z',
    applicationStatus: 'SAVED',
    salaryMin: null,
    salaryMax: null,
    applicationDeadline: null,
    version: 3,
  };

  const latestJobPosting: JobPosting = {
    ...staleJobPosting,
    applicationStatus: 'INTERVIEWING',
    version: 5,
  };

  const initialPage = {
    ...mockPage,
    content: [staleJobPosting],
    totalElements: 1,
    totalPages: 1,
    first: true,
    last: true,
  };

  const refreshedPage = {
    ...initialPage,
    content: [latestJobPosting],
  };

  vi.mocked(fetchJobPostings)
    .mockResolvedValueOnce(initialPage)
    .mockResolvedValueOnce(refreshedPage);

  vi.mocked(updateApplicationStatus)
    .mockRejectedValueOnce(
      new ApiError(
        'JobPosting version conflict',
        412,
        'JOB_POSTING_VERSION_CONFLICT',
      ),
    );

  const user = userEvent.setup();

  renderApp();

  const statusSelect =
    await screen.findByRole('combobox', {
      name: /応募ステータス/,
    });

  await user.selectOptions(statusSelect, 'APPLIED');

  expect(
    await screen.findByRole('alert'),
  ).toHaveTextContent(
    '別の画面で求人が編集されました。',
  );

  await waitFor(() => {
    expect(fetchJobPostings)
      .toHaveBeenCalledTimes(2);
  });

  await waitFor(() => {
    expect(fetchApplicationStatusSummary)
      .toHaveBeenCalledTimes(2);
  });

  expect(
    screen.getByRole('combobox', {
      name: /応募ステータス/,
    }),
  ).toHaveValue('INTERVIEWING');

});

describe('NotFoundPage', () => {

  function LocationDisplay() {
    const location = useLocation();

    return (
      <div data-testid="location">
        {location.pathname}
        {location.search}
      </div>
    );
  }

  test('定義されていないパスにアクセスするとNot Foundページを表示する', async () => {
    render(
      <MemoryRouter initialEntries={['/unknown-page']}>
        <AuthenticatedApp />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', {
        name: 'ページが見つかりません',
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /お探しのページは存在しないか、\s*移動された可能性があります。/
      ),
    ).toBeInTheDocument();

  });

  test('「ホームに戻る」をクリックするとHomePageへ移動する', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/invalid-route']}>
        <AuthenticatedApp />
        <LocationDisplay />
      </MemoryRouter>
    );

    const homeLink = screen.getByRole('link', {
      name: 'ホームに戻る',
    });

    await user.click(homeLink);

    expect(
      await screen.findByText('JobLens Japan')
    ).toBeInTheDocument();

    expect(
      screen.getByTestId('location')
    ).toHaveTextContent('/');
  });
})

