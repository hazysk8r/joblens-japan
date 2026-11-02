import { expect, test } from 'vitest';

test('jsdom環境でdocumentを使用できる', () => {
  expect(document).toBeDefined();
});