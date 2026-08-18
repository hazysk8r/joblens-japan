import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi, test, expect } from 'vitest';

import '@testing-library/jest-dom/vitest';

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

test('시스템이 기술 스택 보기 요청을 처리 중일 때는 버튼을 비활성화하고 이중송신을 막는다', async () => {
  const mockContent: JobPosting = {
    id: 1,
    companyName: '黄猿',
    title: 'エンジニア求人',
    sourceUrl: 'http://example.com/kizaruengineer',
    originalText: 'AWS',
    createdAt: '2026-08-14T00:00:00Z',
    applicationStatus: 'SAVED',
  };
  // 비동기 처리를 위해 resolve 함수를 외부로 추출
  let resolveSkills: (value:string[]) => void = () => {};
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
    name: '기술 스택 보기',
  });
  await user.click(extractSkills);

  const loadingButton = await screen.findByRole('button', {
    name: '처리중...',
  });
  
  expect(loadingButton).toBeDisabled();

  await user.click(extractSkills);
  expect(extractRequiredSkills).toHaveBeenCalledTimes(1);

  resolveSkills(['AWS']);
  // resolveSkill 이후, React가 state를 업데이트해서 화면을 띄우는 작업이 비동기적으로 이어질 수 있음. 
  // AWS가 화면에 나타날 때 까지 기다림
  expect(await screen.findByText('AWS')).toBeInTheDocument();
  

})

test('첫번째 시도에서 실패하더라도 두번째에서 재시도할 수 있다', async () => {
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
    .mockRejectedValueOnce(new Error('기술 스택 조회에 실패했습니다.'))
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
    name: '기술 스택 보기',
  });
  await user.click(extractSkills);

  expect(await screen.findByText('기술 스택 조회에 실패했습니다.')).toBeInTheDocument();
  expect(extractSkills).toBeEnabled();

  await user.click(extractSkills);
  expect(await screen.findByText('AWS')).toBeInTheDocument();

  expect(extractRequiredSkills).toHaveBeenCalledTimes(2);

})