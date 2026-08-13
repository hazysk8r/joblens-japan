import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi, test, expect } from 'vitest';

import App from '../App';
import { fetchApplicationStatusSummary, fetchJobPostings } from '../api/jobPostingApi';

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