import { describe, expect, test } from 'vitest';

import { loginRedirectState, redirectPathFromState } from '../utils/safeRedirect';

describe('ログイン後の戻り先', () => {
  test.each([
    '/',
    '/job-postings/new',
    '/?keyword=AWS&status=APPLIED',
    '/job-postings/new#memo',
  ])('サイト内のパス%sへはそのまま戻る', (from) => {
    expect(redirectPathFromState({ from })).toBe(from);
  });

  test('ログイン画面へ送るときに保存したパスをそのまま読める', () => {
    const state = loginRedirectState({ pathname: '/job-postings/new', search: '?x=1', hash: '#top' });

    expect(redirectPathFromState(state)).toBe('/job-postings/new?x=1#top');
  });

  test.each([
    { name: 'stateなし', state: undefined },
    { name: 'null', state: null },
    { name: '文字列のstate', state: '/job-postings/new' },
    { name: 'fromなし', state: {} },
    { name: 'fromが数値', state: { from: 1 } },
  ])('stateが正しい形でないと($name)/へ行く', ({ state }) => {
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
  ])('サイトの外やパスでない値%sでは/へ行く', (from) => {
    expect(redirectPathFromState({ from })).toBe('/');
  });

  test.each(['/login', '/login?x=1', '/login/'])('ログイン画面(%s)へは戻らない', (from) => {
    expect(redirectPathFromState({ from })).toBe('/');
  });
});
