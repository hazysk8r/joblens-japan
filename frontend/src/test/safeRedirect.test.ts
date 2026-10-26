import { describe, expect, test } from 'vitest';

import { loginRedirectState, redirectPathFromState } from '../utils/safeRedirect';

describe('ログイン後の戻り先', () => {
  test.each([
    '/',
    '/job-postings/new',
    '/?keyword=AWS&status=APPLIED',
    '/job-postings/new#memo',
  ])('사이트 안의 경로 %s는 그대로 돌아간다', (from) => {
    expect(redirectPathFromState({ from })).toBe(from);
  });

  test('로그인 화면으로 보낼 때 저장한 경로를 그대로 읽을 수 있다', () => {
    const state = loginRedirectState({ pathname: '/job-postings/new', search: '?x=1', hash: '#top' });

    expect(redirectPathFromState(state)).toBe('/job-postings/new?x=1#top');
  });

  test.each([
    { name: 'state 없음', state: undefined },
    { name: 'null', state: null },
    { name: '문자열 state', state: '/job-postings/new' },
    { name: 'from 없음', state: {} },
    { name: 'from이 숫자', state: { from: 1 } },
  ])('state가 올바른 형태가 아니면($name) / 로 간다', ({ state }) => {
    expect(redirectPathFromState(state)).toBe('/');
  });

  test.each([
    '//evil.com',
    // 経路部分だけを取り出して、サイト内の画面に置き換えてもいけない。
    '//evil.com/job-postings/new',
    'https://evil.com',
    '/\\evil.com',
    '/\\evil.com/job-postings/new',
    '\\\\evil.com',
    'javascript:alert(1)',
    'evil.com/path',
    '',
  ])('사이트 밖이거나 경로가 아닌 값 %s는 / 로 간다', (from) => {
    expect(redirectPathFromState({ from })).toBe('/');
  });

  test.each(['/login', '/login?x=1', '/login/'])('로그인 화면(%s)으로는 돌아가지 않는다', (from) => {
    expect(redirectPathFromState({ from })).toBe('/');
  });
});
