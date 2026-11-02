import { describe, expect, test } from 'vitest';

import { isHttpUrl } from '../utils/httpUrl';

describe('リンクとして開けるURL', () => {
  test.each([
    'http://example.com',
    'https://example.com/jobs/1',
    'HTTPS://EXAMPLE.COM',
    'https://example.jp/求人/123',
    'https://日本語.jp/jobs',
    'https://example.com/search?q=a|b',
  ])('%sはリンクとして開く', (url) => {
    expect(isHttpUrl(url)).toBe(true);
  });

  test.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://example.com/x',
    'mailto:user@example.com',
    'www.example.com',
    '/jobs',
    '//example.com',
    '',
    'https://',
  ])('%sはリンクとして開かない', (url) => {
    expect(isHttpUrl(url)).toBe(false);
  });
});
