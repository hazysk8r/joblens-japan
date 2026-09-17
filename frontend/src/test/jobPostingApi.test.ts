import {
  updateJobPosting,
  updateApplicationStatus,
} from '../api/jobPostingApi';

import {
  beforeEach,
  afterEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';

describe('jobPostingApi If-Match', () => {
  beforeEach(() => {
    // 実際のHTTP通信を行わずAPIリクエスト内容を検証するため、
    // グローバルのfetchをVitestのMock関数に置き換える。
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async() => ({
          id: 1,
          companyName: 'Test Company',
          title: 'Engineer',
          sourceUrl: null,
          originalText: 'Java AWS',
          createdAt: '2026-09-17T00:00:00Z',
          applicationStatus: 'SAVED',
          salaryMin: null,
          salaryMax: null,
          version: 4,
        }),
      }),
    );
  });

  afterEach(() => {
    // 他のテストにMockしたfetchの状態を残さないように元に戻す。
    vi.unstubAllGlobals();
  });

  test('일반 수정 요청에 현재 version을 If-Match 헤더로 전송한다', async() => {
    await updateJobPosting(
      1,
      {
        companyName: 'Test Company',
        title: 'Engineer',
        sourceUrl: null,
        originalText: 'Java AWS',
        salaryMin: null,
        salaryMax: null,
      },
      3,
    );

    expect(fetch).toHaveBeenCalledWith(
      '/api/job-postings/1',
      // リクエスト全体ではなく、
      // 今回重要なHTTP MethodとIf-Matchヘッダーだけを検証する。
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'If-Match': '"3"',
        }),
      }),
    );
  });

  test('지원 상태 수정 요청에 현재 version을 If-Match 헤더로 전송한다', async () => {
    await updateApplicationStatus(
      1,
      {
        status: 'APPLIED',
      },
      3,
    );

    expect(fetch).toHaveBeenCalledWith(
      '/api/job-postings/1/status',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          'If-Match': '"3"',
        }),
      }),
    );
  });
});