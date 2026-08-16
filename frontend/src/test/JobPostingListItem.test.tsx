import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi, test, expect } from 'vitest';

import { extractRequiredSkills } from '../api/jobPostingApi';
import type { JobPosting } from '../types/jobPosting';
import JobPostingListItem from '../components/JobPostingListItem';

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

vi.mock('../api/jobPostingApi');


test('기술이 있는 공고의 기술 스택 보기 버튼을 누르면 기술 스택을 볼 수 있다', async () => {
  const mockContent: JobPosting = {
    id: 1,
    companyName: '黄猿',
    title: 'エンジニア求人',
    sourceUrl: 'http://example.com/kizaruengineer',
    originalText: 'AWSエンジニア求人',
    createdAt: '2026-08-14T00:00:00Z',
    applicationStatus: 'SAVED',
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
    name: '기술 스택 보기',
  });
  await user.click(extractSkills);

  expect(extractRequiredSkills)
    .toHaveBeenLastCalledWith(
      1
    );

  await screen.findByText('AWS');

});

test('기술이 없는 공고의 경우 기술 스택 보기를 누르면 기술 없음 메시지를 표시한다', async () => {
  const mockContent: JobPosting = {
    id: 1,
    companyName: '黄猿',
    title: 'エンジニア求人',
    sourceUrl: 'http://example.com/kizaruengineer',
    originalText: '営業部求人',
    createdAt: '2026-08-14T00:00:00Z',
    applicationStatus: 'SAVED',
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
    name: '기술 스택 보기',
  });
  await user.click(extractSkills);

  expect(extractRequiredSkills)
    .toHaveBeenLastCalledWith(
      1
    );
  
  await screen.findByText('추출된 기술 스택이 없습니다.');

})

test('존재하지 않는 공고의 경우 기술 스택 보기를 누르면 오류 메시지 표시한다', async () => {
  const mockContent: JobPosting = {
    id: 1,
    companyName: '黄猿',
    title: 'エンジニア求人',
    sourceUrl: 'http://example.com/kizaruengineer',
    originalText: '営業部求人',
    createdAt: '2026-08-14T00:00:00Z',
    applicationStatus: 'SAVED',
  };
  vi.mocked(extractRequiredSkills)
    .mockRejectedValueOnce(new Error('존재하지 않는 공고입니다.'));

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
    name: '기술 스택 보기',
  });
  await user.click(extractSkills);

  expect(extractRequiredSkills)
    .toHaveBeenLastCalledWith(
      1
    );
    
  await screen.findByText('존재하지 않는 공고입니다.');

})