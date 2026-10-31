import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { switchAuthContext } from '../api/apiClient';
import JobPostingCreateForm from '../components/JobPostingCreateForm';

/**
 * 本文がNginxの上限を超えて413で拒否された場合の、求人登録画面までのつながりを検証する。
 *
 * 413はバックエンドではなくNginxが返す。本文の形式(JSON・code・message)は
 * scripts/ci/check_docker_smoke.pyが実際のNginxで確認するため、ここでは同じ値を使う。
 * mockするのはfetchだけ(画面 → jobPostingApi → apiClient は実際のコード)。
 */

// check_docker_smoke.pyとfrontend/nginx.confの値と同じにする。
const PAYLOAD_TOO_LARGE_CODE = 'PAYLOAD_TOO_LARGE';
const PAYLOAD_TOO_LARGE_MESSAGE = 'リクエストのサイズが大きすぎます。';

function stubCreateResponse(response: () => Response) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/job-postings' && init?.method === 'POST') return response();
    return new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } });
  }));
}

async function submitPosting() {
  const onCreated = vi.fn();
  const user = userEvent.setup();
  render(<JobPostingCreateForm onCreated={onCreated} />);
  await user.type(screen.getByLabelText('공고 제목'), 'エンジニア');
  await user.type(screen.getByLabelText('공고 원문'), '非常に長い求人原文');
  await user.click(screen.getByRole('button', { name: '등록' }));
  return onCreated;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  switchAuthContext(null);
});

describe('求人登録が本文サイズの上限で拒否された場合', () => {
  test('413 JSON을 받으면 Nginx의 메시지를 표시하고 입력값을 유지한다', async () => {
    document.cookie = 'XSRF-TOKEN=token-1; path=/';
    stubCreateResponse(() => new Response(JSON.stringify({
      status: 413,
      code: PAYLOAD_TOO_LARGE_CODE,
      message: PAYLOAD_TOO_LARGE_MESSAGE,
      path: '',
      fieldErrors: {},
    }), { status: 413, headers: { 'Content-Type': 'application/json' } }));

    const onCreated = await submitPosting();

    expect(await screen.findByRole('alert')).toHaveTextContent(PAYLOAD_TOO_LARGE_MESSAGE);
    expect(screen.getByLabelText('공고 제목')).toHaveValue('エンジニア');
    expect(screen.getByLabelText('공고 원문')).toHaveValue('非常に長い求人原文');
    expect(onCreated).not.toHaveBeenCalled();
  });

  test('413 본문이 JSON이 아니어도 기본 메시지를 표시한다', async () => {
    document.cookie = 'XSRF-TOKEN=token-1; path=/';
    // Nginxの設定ミスなどで、既定のHTMLのエラーページが返った場合。
    stubCreateResponse(() => new Response('<html><body>413 Request Entity Too Large</body></html>', {
      status: 413,
      headers: { 'Content-Type': 'text/html' },
    }));

    const onCreated = await submitPosting();

    expect(await screen.findByRole('alert')).toHaveTextContent('채용공고 등록에 실패했습니다.');
    expect(screen.getByLabelText('공고 원문')).toHaveValue('非常に長い求人原文');
    expect(onCreated).not.toHaveBeenCalled();
  });
});
