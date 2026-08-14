import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi, test, expect } from 'vitest';

import App from '../App';
import { fetchApplicationStatusSummary, fetchJobPostings, deleteJobPosting, updateJobPosting } from '../api/jobPostingApi';
import type { JobPosting } from '../types/jobPosting';

// 이전 Mock 호출 기록 삭제
beforeEach(() => {
  vi.clearAllMocks();
});
// render()가 만든 React DOM 삭제
afterEach(() => {
  cleanup();
});

vi.mock('../api/jobPostingApi');

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
  render(<App />);

  const sortingSelect = screen.getByRole('combobox', {
    name: '정렬',
  });

  expect(sortingSelect).toBeDefined();
});

test('회사명순 선택 시 해당 정렬값으로 다시 조회한다', async () => {
  const user = userEvent.setup();

  render(<App />);

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
    );
});

test('검색 조건을 유지한 채 회사명 순으로 정렬한다', async () => {
  const user = userEvent.setup();
  render(<App />);

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
    );
});

test('현재 정렬 조건이 페이지를 넘겨도 유지된다', async () => {
  const user = userEvent.setup();
  render(<App />);

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
    );

})

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
  render(<App />);

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
      'companyName,asc'
    );
  
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
  render(<App />);

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
  render(<App />);

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
        },
      );
  });
  await waitFor(() => {
    expect(fetchJobPostings)
      .toHaveBeenLastCalledWith(
        '',
        '',
        0,
        'companyName,asc',
      );
  });
});