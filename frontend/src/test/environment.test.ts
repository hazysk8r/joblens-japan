import { expect, test } from 'vitest';

test('jsdom 환경에서 document를 사용할 수 있다', () => {
  expect(document).toBeDefined();
});