import { useCallback, useEffect, useState, useRef } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams, useNavigationType } from 'react-router';
import '../JobPostingList.css';

import {
  fetchApplicationStatusSummary,
  fetchJobPostings,
} from '../api/jobPostingApi';

import { userMessageOf } from '../api/apiError';

import {
  type ListedJobPosting,
  type ApplicationStatusSummaryResponse,
  type StatusFilter,
  type SalaryFilter,
  type DeadlineFilter,
  type JobPostingSorting,
  type PageResponse,
} from '../types/jobPosting';


import JobPostingListItem
  from '../components/JobPostingListItem';

import ApplicationStatusSummary
  from '../components/ApplicationStatusSummary';

import { SALARY_OPTIONS } from '../constants/salaryOptions';
import { NAVIGATION_NOTICE_TEXT, navigationNoticeOf, withoutNotice } from '../utils/navigationNotice';
import {
  DEFAULT_SORTING,
  hasAdvancedConditions,
  listConditionsFrom,
  parsePage,
  searchParamsOf,
} from '../utils/listSearchParams';

// サーバーのValidDeadlineRangeと同じ文言にする。
const DEADLINE_RANGE_ERROR_MESSAGE =
  '締切日（以降）を締切日（以前）より後の日付にすることはできません。';

type JobPostingListQuery = Parameters<typeof fetchJobPostings>;

// 操作の結果の知らせを表示しておく時間。詳細画面と同じ。
const NOTICE_DURATION_MS = 3000;

function HomePage() {

  const navigationType = useNavigationType();
  const [searchParams, setSearchParams] = useSearchParams();
  // 適用中の検索条件。URLだけを基準にし、画面の状態には複製しない。
  const urlConditions = listConditionsFrom(searchParams);
  const keywordFromUrl = urlConditions.keyword;
  const statusFromUrl = urlConditions.status;
  const pageFromUrl = parsePage(searchParams.get('page'));
  // Effectの依存値やハンドラーで使うため、値として取り出す。
  // 締切日はdeadlineFromFromUrlと読み違えないよう、Start/Endと呼ぶ。
  const sortingFromUrl = urlConditions.sorting;
  const salaryMinFromUrl = urlConditions.salaryMin;
  const salaryMaxFromUrl = urlConditions.salaryMax;
  const deadlineStartFromUrl = urlConditions.deadlineFrom;
  const deadlineEndFromUrl = urlConditions.deadlineTo;
  const currentUrlSearch = searchParams.toString();

  // 最新の一覧取得リクエストだけがStateを更新できるようにする。
  const latestListRequestIdRef = useRef(0);
  // 表示を始めたときのURLの条件。初回の取得だけに使う。
  const initialQueryRef = useRef<JobPostingListQuery>([
    keywordFromUrl, statusFromUrl, pageFromUrl, sortingFromUrl,
    salaryMinFromUrl, salaryMaxFromUrl, deadlineStartFromUrl, deadlineEndFromUrl,
  ]);

  const latestSummaryRequestIdRef = useRef(0);
  // アンマウント後にサマリーの再取得やState更新を行わないようにする。
  const summaryMountedRef = useRef(false);

  const [keyword, setKeyword] = useState(keywordFromUrl);
  const [jobPostings, setJobPostings] = useState<ListedJobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  // false = 一覧APIのリクエストは進行中でない、true = 一覧APIのリクエストが進行中
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(pageFromUrl);
  const [totalPages, setTotalPages] = useState(0);
  const [first, setFirst] = useState(true);
  const [last, setLast] = useState(true);
  const [statusSummary, setStatusSummary] = useState<ApplicationStatusSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>(statusFromUrl);
  const [salaryMin, setSalaryMin] = useState<SalaryFilter>(urlConditions.salaryMin);
  const [salaryMax, setSalaryMax] = useState<SalaryFilter>(urlConditions.salaryMax);
  const [deadlineFrom, setDeadlineFrom] = useState<DeadlineFilter>(urlConditions.deadlineFrom);
  const [deadlineTo, setDeadlineTo] = useState<DeadlineFilter>(urlConditions.deadlineTo);
  const [deadlineRangeError, setDeadlineRangeError] = useState<string | null>(null);
  // 前回のURLクエリを保持し、POPによるURL変更時にフォーム状態を同期するために使用する。
  const [previousUrlSearch, setPreviousUrlSearch] = useState(currentUrlSearch);
  // 詳細条件が適用されていれば開いて見せる。閉じていると、絞り込まれている理由が見えないため。
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(() => hasAdvancedConditions(urlConditions));

  // 詳細画面で削除してから来たときの知らせ。
  const location = useLocation();
  const navigate = useNavigate();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (navigationNoticeOf(location.state, 'deleted') === null) {
      return;
    }
    // 読み上げソフトには、領域と文言が同時に現れると読まないものがあるため、領域を表示した後に文言を入れる。
    setTimeout(() => setNotice(NAVIGATION_NOTICE_TEXT.deleted), 0);
    // 新しく読み込んだり、戻る・進むで同じ履歴に来たりしたときに、もう一度知らせないよう取り除く。
    navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: withoutNotice(location.state) },
    );
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (notice === null) {
      return;
    }
    const timerId = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timerId);
  }, [notice]);

  // 検索条件(並び順とページを除く)があるか。結果がないときの案内を分けるために使う。
  const hasSearchConditions = keywordFromUrl !== ''
    || statusFromUrl !== ''
    || salaryMinFromUrl !== null
    || salaryMaxFromUrl !== null
    || deadlineStartFromUrl !== null
    || deadlineEndFromUrl !== null;

  // 戻る・進む操作でURLが変わった場合、検索フォームをURLの状態に同期する。
  if (currentUrlSearch !== previousUrlSearch) {
    setPreviousUrlSearch(currentUrlSearch);

    if (navigationType === 'POP') {
      // 検索していない入力はURLの条件で上書きする。表示と取得の条件を一致させるため。
      setKeyword(keywordFromUrl);
      setStatus(statusFromUrl);
      setSalaryMin(urlConditions.salaryMin);
      setSalaryMax(urlConditions.salaryMax);
      setDeadlineFrom(urlConditions.deadlineFrom);
      setDeadlineTo(urlConditions.deadlineTo);
      setDeadlineRangeError(null);
      setCurrentPage(pageFromUrl);

      // 詳細条件がない履歴へ戻ったときは、利用者が開いた状態をそのままにする。
      if (hasAdvancedConditions(urlConditions)) {
        setShowAdvancedFilters(true);
      }
    }
  }

  // 一覧の応答を画面に反映する。呼び出す側で、最新の要求の応答かを確かめてから呼ぶ。
  const applyListPage = useCallback((page: PageResponse<ListedJobPosting>) => {
    setJobPostings(page.content);
    setCurrentPage(page.page);
    setTotalPages(page.totalPages);
    setFirst(page.first);
    setLast(page.last);
  }, []);

  /**
     * 検索キーワードを受け取ってバックエンドAPIを呼び出し、
     * 応答のcontentを画面の状態に保存する。
     */
  const loadJobPostings = useCallback(async (
    searchKeyword: string,
    searchFilter: StatusFilter,
    pageNumber: number,
    sort: JobPostingSorting,
    salaryMin: SalaryFilter,
    salaryMax: SalaryFilter,
    deadlineFrom: DeadlineFilter,
    deadlineTo: DeadlineFilter,
  ): Promise<void> => {
    const requestId =
      ++latestListRequestIdRef.current;

    try {
      let page = await fetchJobPostings(
        searchKeyword,
        searchFilter,
        pageNumber,
        sort,
        salaryMin,
        salaryMax,
        deadlineFrom,
        deadlineTo,
      );

      // 古いレスポンスは現在の一覧Stateへ反映しない。
      if (
        requestId !== latestListRequestIdRef.current
      ) {
        return;
      }

      // 現在のページが範囲外になった場合、最後の有効ページを再取得する。
      if (
        page.totalPages > 0 &&
        pageNumber >= page.totalPages
      ) {
        // 最後の有効ページを再取得
        const lastValidPage = page.totalPages - 1;

        page = await fetchJobPostings(
          searchKeyword,
          searchFilter,
          lastValidPage,
          sort,
          salaryMin,
          salaryMax,
          deadlineFrom,
          deadlineTo,
        );

        if (
          requestId !== latestListRequestIdRef.current
        ) {
          return;
        }
      }
      /*
      * 求人一覧だけでなく、バックエンドが返したページ情報も
      * Reactの状態に保存する。
      */
      applyListPage(page);
    } catch (caughtError) {
      if (
        requestId !== latestListRequestIdRef.current
      ) {
        return;
      }

      setError(userMessageOf(caughtError, '求人の読み込み中に不明なエラーが発生しました。'));
    } finally {
      if (
        requestId === latestListRequestIdRef.current
      ) {
        setLoading(false);
      }
    }
  }, [applyListPage]);


  const didMountHistoryEffect = useRef(false);

  useEffect(() => {
    // 初回表示時は別のEffectが一覧を取得するため、History処理をスキップする。
    if (!didMountHistoryEffect.current) {
      didMountHistoryEffect.current = true;
      return;
    }

    // 通常の検索・ページ移動は各Handlerが取得するため、POPの場合だけHistory処理を行う。
    if (navigationType !== 'POP') {
      return;
    }

    // Effectが無効になった後に返ってきた古いレスポンスをStateへ反映しないためのフラグ
    let ignore = false;
    const requestId = ++latestListRequestIdRef.current;

    const loadHistoryData = async () => {
      try {
        let page = await fetchJobPostings(
          keywordFromUrl,
          statusFromUrl,
          pageFromUrl,
          sortingFromUrl,
          salaryMinFromUrl,
          salaryMaxFromUrl,
          deadlineStartFromUrl,
          deadlineEndFromUrl,
        );

        // 現在のページが範囲外の場合は、最後の有効ページを取得する。
        if (
          page.totalPages > 0 &&
          pageFromUrl >= page.totalPages
        ) {
          const lastValidPage =
            page.totalPages - 1;

          page = await fetchJobPostings(
            keywordFromUrl,
            statusFromUrl,
            lastValidPage,
            sortingFromUrl,
            salaryMinFromUrl,
            salaryMaxFromUrl,
            deadlineStartFromUrl,
            deadlineEndFromUrl,
          );
        }

        if (ignore || requestId !== latestListRequestIdRef.current) {
          return;
        }

        applyListPage(page);
        setError(null);
      } catch (caughtError) {
        if (ignore || requestId !== latestListRequestIdRef.current) {
          return;
        }

        const message =
          userMessageOf(caughtError, '求人の読み込み中に不明なエラーが発生しました。');

        setError(message);
      } finally {
        if (!ignore && requestId === latestListRequestIdRef.current) {
          setLoading(false);
        }
      }
    };

    void loadHistoryData();

    // cleanup後に返ってくるレスポンスを無視する。
    return () => {
      ignore = true;
    };
  }, [
    navigationType,
    keywordFromUrl,
    statusFromUrl,
    pageFromUrl,
    sortingFromUrl,
    salaryMinFromUrl,
    salaryMaxFromUrl,
    deadlineStartFromUrl,
    deadlineEndFromUrl,
    applyListPage,
  ]);

  // 初回取得と再取得で応答処理を共有し、最新の有効な要求だけを反映する。
  const fetchAndApplyApplicationStatusSummary = useCallback(async (requestId: number) => {
    try {
      const summary = await fetchApplicationStatusSummary();

      if (!summaryMountedRef.current || requestId !== latestSummaryRequestIdRef.current) {
        return;
      }

      setStatusSummary(summary);
    } catch (caughtError) {
      if (!summaryMountedRef.current || requestId !== latestSummaryRequestIdRef.current) {
        return;
      }

      const message =
        userMessageOf(caughtError, '応募状況の取得に失敗しました。');
      setSummaryError(message);
    } finally {
      if (summaryMountedRef.current && requestId === latestSummaryRequestIdRef.current) {
        setSummaryLoading(false);
      }
    }
  }, []);

  const loadApplicationStatusSummary = useCallback(async () => {
    if (!summaryMountedRef.current) {
      return;
    }

    const requestId = ++latestSummaryRequestIdRef.current;
    setSummaryLoading(true);
    setSummaryError(null);
    await fetchAndApplyApplicationStatusSummary(requestId);
  }, [fetchAndApplyApplicationStatusSummary]);

  // 初回表示時はURLの検索条件で取得する。範囲外のページの補正と古い応答の破棄は共通処理に任せる。
  useEffect(() => {
    void loadJobPostings(...initialQueryRef.current);
  }, [loadJobPostings]);

  useEffect(() => {
    // 初期状態は取得中のため、Effectでは状態をリセットせず要求だけを開始する。
    summaryMountedRef.current = true;
    const requestId = ++latestSummaryRequestIdRef.current;
    void fetchAndApplyApplicationStatusSummary(requestId);

    return () => {
      summaryMountedRef.current = false;
      latestSummaryRequestIdRef.current += 1;
    };
  }, [fetchAndApplyApplicationStatusSummary]);

  const handleSubmit = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    // YYYY-MM-DD形式のため、文字列のまま日付の前後を比較できる。
    if (deadlineFrom && deadlineTo && deadlineFrom > deadlineTo) {
      // 検索条件・URL・一覧は変えず、詳細条件を閉じていてもエラーが見えるようにする。
      setDeadlineRangeError(DEADLINE_RANGE_ERROR_MESSAGE);
      setShowAdvancedFilters(true);
      return;
    }

    const nextKeyword = keyword.trim();
    const nextStatus = status;
    const nextSalaryMin = salaryMin;
    const nextSalaryMax = salaryMax;
    const nextDeadlineFrom = deadlineFrom;
    const nextDeadlineTo = deadlineTo;

    // 並び順は選んだときに適用済みのため、URLの値を引き継ぐ。新しい検索のため、pageは含めない。
    setSearchParams(searchParamsOf({
      keyword: nextKeyword,
      status: nextStatus,
      salaryMin: nextSalaryMin,
      salaryMax: nextSalaryMax,
      deadlineFrom: nextDeadlineFrom,
      deadlineTo: nextDeadlineTo,
      sorting: sortingFromUrl,
    }));

    /*
    * 新しい検索を始めるときは、
    * 前のページ位置に関係なく最初のページから取得する。
    */
    setLoading(true);
    setError(null);

    void loadJobPostings(nextKeyword, nextStatus, 0, sortingFromUrl, nextSalaryMin, nextSalaryMax, nextDeadlineFrom, nextDeadlineTo);
  };


  const handlePreviousPage = () => {
    if (first || loading) {
      return;
    }

    const previousPage = currentPage - 1;

    // 現在の検索条件を維持したまま、前のページ番号をURLに反映する。
    // 1ページ目はデフォルト値のため、pageパラメータをURLから削除する。
    const nextSearchParams = new URLSearchParams(searchParams);

    if (previousPage === 0) {
      nextSearchParams.delete('page');
    } else {
      nextSearchParams.set(
        'page',
        String(previousPage),
      );
    }

    setSearchParams(nextSearchParams);

    setLoading(true);
    setError(null);

    void loadJobPostings(
      keywordFromUrl,
      statusFromUrl,
      currentPage - 1,
      sortingFromUrl,
      salaryMinFromUrl,
      salaryMaxFromUrl,
      deadlineStartFromUrl,
      deadlineEndFromUrl,
    );
  };

  const handleNextPage = () => {
    if (last || loading) {
      return;
    }

    const nextPage = currentPage + 1;

    const nextSearchParams = new URLSearchParams(searchParams);

    nextSearchParams.set(
      'page',
      String(nextPage),
    );

    setSearchParams(nextSearchParams);

    setLoading(true);
    setError(null);

    void loadJobPostings(
      keywordFromUrl,
      statusFromUrl,
      currentPage + 1,
      sortingFromUrl,
      salaryMinFromUrl,
      salaryMaxFromUrl,
      deadlineStartFromUrl,
      deadlineEndFromUrl,
    );
  };


  const handleGoBackToHomepage = async () => {
    // Query Parameterを空にする
    setSearchParams({});
    // Form State
    setKeyword('');
    setStatus("");
    setSalaryMin(null);
    setSalaryMax(null);
    setDeadlineFrom(null);
    setDeadlineTo(null);
    setShowAdvancedFilters(false);
    setDeadlineRangeError(null);
    // Server Data
    setLoading(true);
    setError(null);
    await loadJobPostings('', '', 0, DEFAULT_SORTING, null, null, null, null);
  };

  return (
    <main>
      <header className="home-header">
        <h1>
          <button
            type="button"
            className="home-title-button"
            onClick={handleGoBackToHomepage}
          >
            JobLens Japan
          </button>
        </h1>

        <Link
          to="/job-postings/new"
          className="create-job-posting-link"
        >
          ＋ 求人を登録する
        </Link>
      </header>

      {/* 内容が変わったときに読み上げられるよう、領域は空でも表示しておく。 */}
      <p role="status" className="home-notice">{notice}</p>

      <ApplicationStatusSummary
        summary={statusSummary}
        loading={summaryLoading}
        error={summaryError}
        onRetry={loadApplicationStatusSummary}
      />

      <hr />

      <h2>求人検索</h2>

      <form onSubmit={handleSubmit}>
        <div className="search-main-row">
          <label htmlFor='search'>検索キーワード</label>
          <input
            id='search'
            type="text"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="AWS, Java, 会社名で検索"
          />

          <label htmlFor="status">ステータス</label>
          <select
            id="status"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as StatusFilter)
            }
          >
            <option value="">
              すべて
            </option>
            <option value="SAVED">
              保存済み
            </option>
            <option value="APPLIED">
              応募済み
            </option>
            <option value="INTERVIEWING">
              面接中
            </option>
            <option value="OFFERED">
              内定
            </option>
            <option value="REJECTED">
              不採用
            </option>

          </select>

          <button
            type="submit"
            disabled={loading}
          >
            {loading ? '検索中…' : '検索'}
          </button>
        </div>

        <button 
          type="button"
          className="advanced-filter-toggle"
          aria-expanded={showAdvancedFilters}
          aria-controls="advanced-search-filters"
          onClick={() => 
            setShowAdvancedFilters((previous) => !previous)
          }
        >
          {showAdvancedFilters
            ? '－ 詳細条件を閉じる'
            : '＋ 詳細条件'
          }
        </button>

        {showAdvancedFilters && (
          <div 
            id="advanced-search-filters"
            className="advanced-filter"
          >
            <label htmlFor="search-salaryMin">最低月給</label>
            <select
              id="search-salaryMin"
              value={salaryMin ?? ""}
              onChange={(event) => {
                const value = event.target.value;

                setSalaryMin(
                  value === "" ? null : Number(value)
                );
              }}
            >
              <option value="">指定なし</option>

              {SALARY_OPTIONS.map((salary) => (
                <option
                  key={salary}
                  value={salary}
                  disabled={
                    salaryMax != null &&
                    salary > salaryMax
                  }
                >
                  {salary.toLocaleString()}円
                </option>
              ))}
            </select>

            <label htmlFor="search-salaryMax">最高月給</label>
            <select
              id="search-salaryMax"
              value={salaryMax ?? ""}
              onChange={(event) => {
                const value = event.target.value;

                setSalaryMax(
                  value === "" ? null : Number(value)
                );
              }}
            >
              <option value="">指定なし</option>
              {SALARY_OPTIONS.map((salary) => (
                <option
                  key={salary}
                  value={salary}
                  disabled={
                    salaryMin !== null &&
                    salary < salaryMin
                  }
                >
                  {salary.toLocaleString()}円
                </option>
              ))}

            </select>

            <label htmlFor="deadlineFrom">締切日（以降）</label>
            <input
              id="deadlineFrom"
              type="date"
              value={deadlineFrom ?? ''}
              onChange={(event) => {
                setDeadlineFrom(
                  event.target.value || null,
                );
                setDeadlineRangeError(null);
              }}
            />

            <label htmlFor="deadlineTo">締切日（以前）</label>
            <input
              id="deadlineTo"
              type="date"
              value={deadlineTo ?? ''}
              aria-invalid={deadlineRangeError ? true : undefined}
              aria-describedby={deadlineRangeError ? 'deadlineTo-error' : undefined}
              onChange={(event) => {
                setDeadlineTo(
                  event.target.value || null,
                );
                setDeadlineRangeError(null);
              }}
            />

            {deadlineRangeError && (
              <p id="deadlineTo-error" role="alert">
                {deadlineRangeError}
              </p>
            )}

            <label htmlFor="sorting">並び替え</label>
            <select
              // 並び順はすぐに適用するため、入力欄の状態を持たずURLの値を表示する。
              id="sorting"
              value={sortingFromUrl}
              onChange={(event) => {
                const nextSorting =
                  event.target.value as JobPostingSorting;

                // 並び順は表示の切り替えのため、新しい履歴は作らない。既定の並び順はURLから省き、1ページ目に戻す。
                const nextSearchParams = new URLSearchParams(searchParams);
                if (nextSorting === DEFAULT_SORTING) {
                  nextSearchParams.delete('sort');
                } else {
                  nextSearchParams.set('sort', nextSorting);
                }
                nextSearchParams.delete('page');
                setSearchParams(nextSearchParams, { replace: true });

                setLoading(true);
                setError(null);
                // 今すぐAPIリクエストに使う値
                void loadJobPostings(
                  keywordFromUrl,
                  statusFromUrl,
                  0,
                  nextSorting,
                  salaryMinFromUrl,
                  salaryMaxFromUrl,
                  deadlineStartFromUrl,
                  deadlineEndFromUrl,
                );
              }}
            >
              <option value='createdAt,desc'>
                新しい順
              </option>
              <option value='createdAt,asc'>
                古い順
              </option>
              <option value='companyName,asc'>
                会社名順
              </option>
            </select>
          </div>
        )}
      </form>

      {loading ? (
        <p role="status">
          求人を読み込み中…
        </p>
      ) : error ? (
        <p role="alert">
          {error}
        </p>
      ) : jobPostings.length === 0 ? (
        hasSearchConditions ? (
          <p>検索結果はありません。</p>
        ) : (
          // 初めての利用者には、何をすればよいかと、次の操作を案内する。
          <div className="home-empty">
            <p>まだ求人が登録されていません。</p>
            <p>求人票を貼り付けて登録すると、固定残業代などを自動で確認できます。</p>
            <Link to="/job-postings/new" className="create-job-posting-link">
              ＋ 求人を登録する
            </Link>
          </div>
        )
      ) : (
        <>
          {/* 自動判定であることと、根拠の確かめ方を一覧の前で伝える。カードごとに書くと繰り返しが多すぎるため。 */}
          <p className="job-posting-list__notice">
            固定残業代の表示は求人票からの自動判定です。根拠は詳細画面で確認できます。
          </p>
          <ul className="job-posting-list" role="list">
            {jobPostings.map((jobPosting) => (
              <JobPostingListItem key={jobPosting.id} jobPosting={jobPosting} />
            ))}
          </ul>
        </>
      )}

      {!error && totalPages > 0 && (
        <div>
          <button
            type="button"
            onClick={handlePreviousPage}
            disabled={first || loading}
          >
            前へ
          </button>

          <span>
            {currentPage + 1} / {totalPages}
          </span>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={last || loading}
          >
            次へ
          </button>
        </div>
      )}
    </main>
  );
}

export default HomePage;
