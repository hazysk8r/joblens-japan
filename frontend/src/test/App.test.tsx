import { cleanup, render, screen, waitFor, within, } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, vi, test, expect, describe, } from 'vitest';

import App from '../App';
import { fetchApplicationStatusSummary, fetchJobPostings, deleteJobPosting, updateJobPosting, createJobPosting, extractRequiredSkills } from '../api/jobPostingApi';
import type { JobPosting } from '../types/jobPosting';
import JobPostingListItem from '../components/JobPostingListItem';

// 이전 Mock 호출 기록 삭제
beforeEach(() => {
  vi.clearAllMocks();
});
// render()가 만든 React DOM 삭제
afterEach(() => {
  cleanup();
});

vi.mock('../api/jobPostingApi');

const renderApp = (initialEntry = '/') => {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
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


vi.mocked(fetchJobPostings).mockResolvedValue(mockPage);
vi.mocked(fetchApplicationStatusSummary).mockResolvedValue(mockSummary);

test('정렬 select가 보인다', () => {
  renderApp();

  const sortingSelect = screen.getByRole('combobox', {
    name: '정렬',
  });

  expect(sortingSelect).toBeDefined();
});

test('회사명순 선택 시 해당 정렬값으로 다시 조회한다', async () => {
  const user = userEvent.setup();

  renderApp();

  const sortingSelect = screen.getByRole('combobox', {
    name: '정렬',
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
    );
});

test('검색 조건을 유지한 채 회사명 순으로 정렬한다', async () => {
  const user = userEvent.setup();
  renderApp();

  const keywordInput = screen.getByRole('textbox', {
    name: '검색어',
  });
  const statusSelect = screen.getByRole('combobox', {
    name: '상태',
  });
  const sortingSelect = screen.getByRole('combobox', {
    name: '정렬',
  });

  const searchButton = await screen.findByRole('button', {
    name: '검색',
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
    );
});

test('현재 정렬 조건이 페이지를 넘겨도 유지된다', async () => {
  const user = userEvent.setup();
  renderApp();

  const sortingSelect = screen.getByRole('combobox', {
    name: '정렬',
  });
  const nextPageButton = await screen.findByRole('button', {
    name: '다음',
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
    );

});

test('사용자가 선택한 정렬 상태를 유지한 채 다음 페이지로 갔다가 이전 페이지로 돌아올 수 있다', async () => {
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

  const sortingSelect = screen.getByRole('combobox', {
    name: '정렬',
  });
  await user.selectOptions(sortingSelect, 'companyName,asc');

  const nextPageButton = await screen.findByRole('button', {
    name: '다음',
  });
  await waitFor(() => {
    expect(
      (nextPageButton as HTMLButtonElement).disabled
    ).toBe(false);
  });
  await user.click(nextPageButton);

  const previousPageButton = await screen.findByRole('button', {
    name: '이전',
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
    );

});

test('현재 페이지가 범위를 벗어나면 마지막 유효 페이지를 다시 조회한다', async () => {
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
    name: '다음',
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
      name: /지원 상태/,
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
        1, // 마지막 유효 페이지
        'createdAt,desc',
        null,
        null,
      );
  });

  expect(
    screen.getByText('2 / 2')
  ).toBeDefined();
  
});

test('공고 원문이 변경되면 이전 기술스택 캐시를 사용하지 않고 다시 조회한다', async () => {
  const user = userEvent.setup();

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
    version: 0,
  };

  vi.mocked(extractRequiredSkills)
    .mockResolvedValueOnce(['AWS'])
    .mockResolvedValueOnce(['Java']);

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

  const { rerender } = render(
    <JobPostingListItem
      jobPosting={jobPosting}
      {...props}
    />,
  );

  const skillsButton = screen.getByRole('button', {
    name: '기술 스택 보기',
  });

  // 最初取得
  await user.click(skillsButton);

  expect(
    await screen.findByText('AWS'),
  ).toBeDefined();

  expect(extractRequiredSkills)
    .toHaveBeenCalledTimes(1);

  // 原文が変更された求人情報をrerender
  rerender(
    <JobPostingListItem
      jobPosting={{
        ...jobPosting,
        originalText: 'Javaエンジニア求人',
        version: 1,
      }}
      {...props}
    />,
  );

  expect(
    screen.queryByText('AWS'),
  ).toBeNull();

  await user.click(
    screen.getByRole('button', {
      name: '기술 스택 보기',
    }),
  );

  expect(
    await screen.findByText('Java'),
  ).toBeDefined();

  expect(extractRequiredSkills)
    .toHaveBeenCalledTimes(2);
});

test('특정 정렬 상태에서 삭제 행위가 이뤄져도 사용자가 선택한 정렬 상태를 유지할 수 있다', async () => {
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

  const sortingSelect = screen.getByRole('combobox', {
    name: '정렬',
  });
  await user.selectOptions(sortingSelect, 'companyName,asc');

  const deleteButton = await screen.findByRole('button', {
    name: '삭제'
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
      );
  });

});



test('특정 정렬 상태에서 수정 행위가 이뤄져도 사용자가 선택한 정렬 상태를 유지할 수 있다', async () => {
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

  const sortingSelect = screen.getByRole('combobox', {
    name: '정렬',
  });
  await user.selectOptions(sortingSelect, 'companyName,asc');

  const updateButton = await screen.findByRole('button', {
    name: '수정'
  });
  await user.click(updateButton);

  const jobPostingItem = screen.getByRole('listitem');

  const titleInput = within(jobPostingItem).getByRole('textbox', {
    name: '공고 제목',
  });

  await user.clear(titleInput);
  await user.type(titleInput, 'クラウドエンジニア求人');

  const saveButton = screen.getByRole('button', {
    name: '저장',
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
      );
  });
});

test('검색어나 필터가 적용된 상태에서 JobLens Japan 을 누르면, 첫페이지 기본정렬로 돌아간다', async() => {
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
    version: 0,
  };

  const pageWithContent= {
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
    .mockResolvedValueOnce(firstPage) //초기 render
    .mockResolvedValueOnce(firstPage) //검색
    .mockResolvedValueOnce(firstPage) //정렬변경
    .mockResolvedValueOnce(secondPage); //다음 페이지

  const user= userEvent.setup();
  renderApp();

  const keywordInput = screen.getByRole('textbox', {
    name: '검색어',
  });
  const statusSelect = screen.getByRole('combobox', {
    name: '상태',
  });
  const sortingSelect = screen.getByRole('combobox', {
    name: '정렬',
  });

  const searchButton = await screen.findByRole('button', {
    name: '검색',
  });

  const goBackToHome = await screen.findByRole('button', {
    name: 'JobLens Japan'
  })

  await user.type(keywordInput, 'AWS');

  await user.selectOptions(statusSelect, 'APPLIED');

  await user.click(searchButton);

  await user.selectOptions(sortingSelect, 'companyName,asc');

  const nextPageButton = await screen.findByRole('button', {
    name: '다음',
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
      );
  });
});

test('월급 범위를 선택하고 검색하면 salaryMin과 salaryMax를 전달한다', async() => {
  const user = userEvent.setup();

  renderApp();

  const salaryMinSelect = screen.getByLabelText(
    '최저 월급',
    {selector: '#search-salaryMin'},
  );

  const salaryMaxSelect = screen.getByLabelText(
    '최고 월급',
    {selector: '#search-salaryMax'},
  );

  const searchButton = await screen.findByRole(
    'button',
    { name: '검색' },
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
    );
});

test('최저 월급보다 낮은 최고 월급은 선택할 수 없다', async() => {
  const user = userEvent.setup();

  renderApp();

  const salaryMinSelect = screen.getByLabelText(
    '최저 월급',
    { selector: '#search-salaryMin'},
  );

  const salaryMaxSelect = screen.getByLabelText(
    '최고 월급',
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

test('월급 범위를 포함하여 채용공고를 등록할 수 있다', async () => {
  const user = userEvent.setup();

  renderApp('/job-postings/new')

  await user.type(
    screen.getByRole('textbox', {
      name: '공고 제목',
    }),
    'クラウドエンジニア',
  );

  await user.type(
    screen.getByRole('textbox', {
      name: '공고 원문',
    }),
    'AWS Java',
  );

  const salaryMinSelect = screen.getByLabelText(
    '최저 월급',
    { selector: '#create-salaryMin' },
  );

  const salaryMaxSelect = screen.getByLabelText(
    '최고 월급',
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
      name: '채용공고 등록',
    })
    .closest('section');

  if (!createSection) {
    throw new Error('채용공고 등록 영역을 찾을 수 없습니다.');
  }

  const createButton = within(createSection)
    .getByRole('button', {
      name: '등록',
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
      });
  });
});

test('홈에서求人を登録する 링크를 누르면 채용공고 등록 페이지로 이동한다', async () => {
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
      name: '채용공고 등록',
    });

  expect(createFormHeading).toBeDefined();
});

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
          뒤로가기
        </button>

        <button
          type="button"
          onClick={() => navigate(1)}
        >
          앞으로가기
        </button>
      </>
    );
  }

  const renderAppWithLocation = (
    initialEntry = '/',
  ) => {
    return render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
        <LocationDisplay />
        <HistoryControls />
      </MemoryRouter>,
    );
  };
  
  test(
    'URL의 검색 조건으로 검색 상태와 목록을 복원한다',
    async () => {
      renderApp(
        '/?keyword=Java&status=APPLIED&page=2',
      );

      const keywordInput = screen.getByRole(
        'textbox',
        {
          name: '검색어',
        },
      );

      const statusSelect = screen.getByRole(
        'combobox',
        {
          name: '상태',
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
          );
      });
    },
  );

  test(
    '검색 실행 시 검색 조건을 URL에 반영하고 page를 0으로 초기화한다',
    async () => {
      const user = userEvent.setup();

      renderAppWithLocation(
        '/?keyword=AWS&status=SAVED&page=2',
      );

      const keywordInput = screen.getByRole(
        'textbox',
        {
          name: '검색어',
        },
      );

      const statusSelect = screen.getByRole(
        'combobox',
        {
          name: '상태',
        },
      );

      await user.clear(keywordInput);
      await user.type(keywordInput, 'Java');
      await user.selectOptions(statusSelect, 'APPLIED');

      const searchButton = await screen.findByRole('button', {
        name: '검색',
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
    '다음 페이지로 이동하면 page를 URL에 반영한다',
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
            name: '다음',
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
    '첫 페이지로 돌아오면 URL에서 page 파라미터를 제거한다',
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
            name: '이전',
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
    '뒤로가기 시 이전 URL의 검색 조건과 목록을 복원한다',
    async () => {
      const user = userEvent.setup();

      renderAppWithLocation(
        '/?keyword=AWS&status=SAVED',
      );

      const keywordInput = screen.getByRole(
        'textbox',
        {
          name: '검색어',
        },
      );

      const statusSelect = screen.getByRole(
        'combobox',
        {
          name: '상태',
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
            name: '검색',
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
            name: '뒤로가기',
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
          );
      });
    },
  );

  test(
    '잘못된 status와 page Query는 기본값으로 처리한다',
    async () => {
      renderAppWithLocation(
        '/?keyword=Java&status=UNKNOWN&page=abc',
      );

      const keywordInput = screen.getByRole(
        'textbox',
        {
          name: '검색어',
        },
      );

      const statusSelect = screen.getByRole(
        'combobox',
        {
          name: '상태',
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
          );
      });
    },
  );
});