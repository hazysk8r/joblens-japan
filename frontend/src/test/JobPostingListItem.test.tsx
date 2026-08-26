import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, vi, test, expect } from 'vitest';

import '@testing-library/jest-dom/vitest';

import { extractRequiredSkills } from '../api/jobPostingApi';
import { getJobPostingMemos } from '../api/jobPostingMemoApi';
import type { JobPosting } from '../types/jobPosting';
import JobPostingListItem from '../components/JobPostingListItem';
import type { JobPostingMemo } from '../types/jobPostingMemo';

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(getJobPostingMemos)
    .mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
});

vi.mock('../api/jobPostingApi');
vi.mock('../api/jobPostingMemoApi')


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

test('기술 스택 보기를 누르면 기술이 데이터에 남아있고 추가 API호출 없이 데이터를 사용할 수 있다', async () => {
  const mockContent: JobPosting = {
    id: 1,
    companyName: '黄猿',
    title: 'エンジニア求人',
    sourceUrl: 'http://example.com/kizaruengineer',
    originalText: 'エンジニア求人',
    createdAt: '2026-08-14T00:00:00Z',
    applicationStatus: 'SAVED',
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
    name: '기술 스택 보기',
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

test('등록된 메모 목록이 정상적으로 표시된다.', async () => {
  const mockContent: JobPosting = {
    id: 1,
    companyName: '黄猿',
    title: 'エンジニア求人',
    sourceUrl: 'http://example.com/kizaruengineer',
    originalText: 'AWSエンジニア求人',
    createdAt: '2026-08-14T00:00:00Z',
    applicationStatus: 'SAVED',
  };
  const mockMemo: JobPostingMemo = {
    id: 1,
    content: '面談準備中',
    createdAt: '2026-08-26T00:00:00Z',
    updatedAt: '2026-08-26T00:00:00Z',
  }
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
    />
  );

  expect(getJobPostingMemos)
    .toHaveBeenLastCalledWith(
      1
    );

  expect(await screen.findByText('面談準備中')).toBeInTheDocument();
});

test('메모가 없을 때 메시지로 메모가 없음을 확인할 수 있다.', async () => {
  const mockContent: JobPosting = {
    id: 1,
    companyName: '黄猿',
    title: 'エンジニア求人',
    sourceUrl: 'http://example.com/kizaruengineer',
    originalText: 'AWSエンジニア求人',
    createdAt: '2026-08-14T00:00:00Z',
    applicationStatus: 'SAVED',
  };
  vi.mocked(getJobPostingMemos)
    .mockResolvedValueOnce([]);

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

  expect(getJobPostingMemos)
    .toHaveBeenLastCalledWith(
      1
    );

  expect(await screen.findByText('등록된 메모가 없습니다.')).toBeInTheDocument();
});

test('존재하지 않는 공고의 경우 에러 메시지를 표기한다', async () => {
  const mockContent: JobPosting = {
    id: 1,
    companyName: '黄猿',
    title: 'エンジニア求人',
    sourceUrl: 'http://example.com/kizaruengineer',
    originalText: '営業部求人',
    createdAt: '2026-08-14T00:00:00Z',
    applicationStatus: 'SAVED',
  };

  vi.mocked(getJobPostingMemos)
    .mockRejectedValueOnce(new Error('존재하지 않는 공고입니다.'));

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

  expect(getJobPostingMemos)
    .toHaveBeenCalledWith(
      1
    );

  expect(await screen.findByText('존재하지 않는 공고입니다.')).toBeInTheDocument();
  expect(screen.queryByText('등록된 메모가 없습니다.')).not.toBeInTheDocument(); // 없어야 하는 요소를 검사할 때는 query 사용(지금 없다면 null을 반환)
});

test('메모를 등록한 후 재조회가 가능하다', async () => {
  const mockContent: JobPosting = {
    id: 1,
    companyName: '黄猿',
    title: 'エンジニア求人',
    sourceUrl: 'http://example.com/kizaruengineer',
    originalText: '営業部求人',
    createdAt: '2026-08-14T00:00:00Z',
    applicationStatus: 'SAVED',
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
  // 초기 Get 완료 확인
  expect(
    await screen.findByText('등록된 메모가 없습니다.'),
  ).toBeInTheDocument();

  const textArea = screen.getByRole('textbox', {
    name: '메모내용',
  });
  await user.type(textArea, '面談準備中');

  const writeMemo = await screen.findByRole('button', {
    name: '등록',
  });
  await user.click(writeMemo);

  expect(getJobPostingMemos)
    .toHaveBeenCalledTimes(2);

  expect(getJobPostingMemos)
    .toHaveBeenCalledWith(1);

  expect(await screen.findByText('面談準備中')).toBeInTheDocument();
});