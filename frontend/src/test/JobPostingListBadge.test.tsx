import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { AuthenticatedApp } from './testAuth';
import { ApiError } from '../api/apiError';
import { fetchApplicationStatusSummary, fetchJobPostings } from '../api/jobPostingApi';
import JobPostingAnalysisPanel from '../components/JobPostingAnalysisPanel';
import JobPostingListItem from '../components/JobPostingListItem';
import type {
  FixedOvertimeStatus,
  FixedOvertimeSummary,
  ListedJobPosting,
  PageResponse,
} from '../types/jobPosting';

vi.mock('../api/jobPostingApi');

const NOTICE = '固定残業代の表示は求人票からの自動判定です。根拠は詳細画面で確認できます。';

function listed(fixedOvertime: FixedOvertimeSummary | null): ListedJobPosting {
  return {
    id: 1,
    companyName: '東京テック',
    title: 'バックエンドエンジニア',
    sourceUrl: null,
    originalText: '求人の原文',
    createdAt: '2026-10-17T00:00:00Z',
    applicationStatus: 'SAVED',
    salaryMin: 300000,
    salaryMax: 500000,
    applicationDeadline: null,
    version: 0,
    fixedOvertime,
  };
}

function renderCard(posting: ListedJobPosting) {
  render(
    <MemoryRouter>
      <ul><JobPostingListItem jobPosting={posting} /></ul>
    </MemoryRouter>,
  );
  return screen.getByRole('listitem');
}

const badgeOf = (card: HTMLElement) => card.querySelector('.job-posting-card__badge');

function pageOf(...content: ListedJobPosting[]): PageResponse<ListedJobPosting> {
  return {
    content, page: 0, size: 5, totalElements: content.length,
    totalPages: content.length > 0 ? 1 : 0, first: true, last: true,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchApplicationStatusSummary).mockResolvedValue({
    saved: 1, applied: 0, interviewing: 0, offered: 0, rejected: 0,
  });
});

afterEach(() => {
  cleanup();
});

describe('一覧のカードの固定残業代のバッジ', () => {
  test.each<[FixedOvertimeStatus, number | null, string, string]>([
    ['PRESENT', 40, '固定残業代 あり（月40時間分）', 'warning'],
    ['PRESENT', null, '固定残業代 あり（時間数は特定できず）', 'warning'],
    ['UNDETERMINED', null, '固定残業代 判定できず', 'warning'],
    ['ABSENT', null, '固定残業代 なし', 'neutral'],
    ['NOT_MENTIONED', null, '固定残業代 記載なし', 'muted'],
  ])('%s(%s)は「%s」と表示する', (status, hours, text, tone) => {
    const card = renderCard(listed({ status, hours }));

    const badge = badgeOf(card);
    // 文言の全体が一致することを確かめる。正規表現にすると、文言の記号のエスケープ漏れで誤判定し得るため。
    expect(badge?.textContent).toBe(text);
    expect(badge).toHaveClass(`job-posting-card__badge--${tone}`);
  });

  test('判定がない(サーバーで分析に失敗した)求人にはバッジを出さない', () => {
    const card = renderCard(listed(null));

    expect(badgeOf(card)).toBeNull();
    expect(card).not.toHaveTextContent('固定残業代');
  });

  test('応答に判定の項目がなくても、カードを表示してバッジは出さない', () => {
    const withoutField: Partial<ListedJobPosting> = listed({ status: 'PRESENT', hours: 40 });
    delete withoutField.fixedOvertime;
    const card = renderCard(withoutField as ListedJobPosting);

    expect(card).toHaveTextContent('バックエンドエンジニア');
    expect(badgeOf(card)).toBeNull();
  });

  test('知らない判定にはバッジを出さない', () => {
    const card = renderCard(listed({ status: 'SOMETHING_NEW' as FixedOvertimeStatus, hours: null }));

    expect(badgeOf(card)).toBeNull();
  });

  test('バッジは詳細画面の分析と同じ言葉を使う', () => {
    const card = renderCard(listed({ status: 'PRESENT', hours: 45 }));
    render(
      <JobPostingAnalysisPanel
        analysis={{
          fixedOvertime: { status: 'PRESENT', hours: 45, excessPayStated: false, evidence: [] },
          skills: [],
        }}
      />,
    );

    const panel = screen.getByRole('region', { name: '固定残業代' });
    expect(within(panel).getByText('あり（月45時間分）')).toBeInTheDocument();
    expect(badgeOf(card)).toHaveTextContent(/^固定残業代 あり（月45時間分）$/);
  });

  test('バッジは操作できる要素にしない', () => {
    const card = renderCard(listed({ status: 'PRESENT', hours: 40 }));

    expect(badgeOf(card)?.closest('a, button')).toBeNull();
  });
});

describe('一覧の自動判定の案内', () => {
  function renderHome() {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthenticatedApp />
      </MemoryRouter>,
    );
  }

  test('求人があれば一覧の上に案内を出す', async () => {
    vi.mocked(fetchJobPostings).mockResolvedValue(pageOf(listed({ status: 'ABSENT', hours: null })));
    renderHome();

    const list = await screen.findByRole('list');
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    // 案内は一覧より前に読み上げる。
    expect(screen.getByText(NOTICE).compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  test('検索結果が0件なら案内を出さない', async () => {
    vi.mocked(fetchJobPostings).mockResolvedValue(pageOf());
    renderHome();

    await screen.findByText('検索結果はありません。');
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  test('読み込み中と取得の失敗では案内を出さない', async () => {
    vi.mocked(fetchJobPostings).mockReturnValueOnce(new Promise(() => {}));
    renderHome();
    await screen.findByText('求人を読み込み中…');
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
    cleanup();

    vi.mocked(fetchJobPostings).mockRejectedValue(new ApiError('取得に失敗しました。', 500));
    renderHome();
    await screen.findByText('取得に失敗しました。');
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});
