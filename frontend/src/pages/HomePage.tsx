import { useCallback, useEffect, useState, useRef } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams, useNavigationType } from 'react-router';
import '../JobPostingList.css';

import {
  deleteJobPosting,
  fetchApplicationStatusSummary,
  fetchJobPostings,
  updateJobPosting,
} from '../api/jobPostingApi';

import { ApiError, isJobPostingVersionConflict } from '../api/apiError';

import {
  type JobPosting,
  type UpdateJobPostingRequest,
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

// 求人情報一覧の初期取得に使用するデフォルトのソート条件
const DEFAULT_SORTING: JobPostingSorting = 'createdAt,desc';

// サーバーのValidDeadlineRangeと同じ文言にする。
const DEADLINE_RANGE_ERROR_MESSAGE =
  '締切日（以降）を締切日（以前）より後の日付にすることはできません。';

type EditingSession = {
  sessionId: number;
  jobPostingId: number;
  expectedVersion: number;
  jobPosting: JobPosting;
};

type EditFieldErrors = {
  sessionId: number;
  fieldErrors: Record<string, string>;
};

type EditRecovery = {
  pending: boolean;
  error: string | null;
};

type ListLoadResult =
  | { status: 'updated'; content: JobPosting[] }
  | { status: 'failed'; message: string }
  | { status: 'superseded' };

type JobPostingListQuery = Parameters<typeof fetchJobPostings>;

// URLのstatusを有効なStatusFilterに変換する。
function parseStatusFilter(
  value: string | null,
): StatusFilter {
  switch (value) {
    case 'SAVED':
    case 'APPLIED':
    case 'INTERVIEWING':
    case 'OFFERED':
    case 'REJECTED':
      return value;

    default:
      return '';
  }
}

// URLのpageを0以上の整数に変換する。
// 不正な値の場合は1ページ目（0）を使用する。
function parsePage(
  value: string | null,
): number {
  if (value === null) {
    return 0;
  }

  const page = Number(value);

  if (
    !Number.isInteger(page) ||
    page < 0
  ) {
    return 0;
  }

  return page;
}

function HomePage() {

  const navigationType = useNavigationType();
  const [searchParams, setSearchParams] = useSearchParams();
  const keywordFromUrl = searchParams.get('keyword') ?? '';
  const statusFromUrl = parseStatusFilter(searchParams.get('status'));
  const pageFromUrl = parsePage(searchParams.get('page'));
  const currentUrlSearch = searchParams.toString();

  // 最新の一覧取得リクエストだけがStateを更新できるようにする。
  const latestListRequestIdRef = useRef(0);
  const latestListQueryRef = useRef<JobPostingListQuery>([
    keywordFromUrl, statusFromUrl, pageFromUrl,
    DEFAULT_SORTING, null, null, null, null,
  ]);
  const nextEditingSessionIdRef = useRef(0);
  // 非同期処理で最新の編集セッションを参照するために使用する。
  const editingSessionRef = useRef<EditingSession | null>(null);
  const nextRecoveryIdRef = useRef(0);
  const recoveryRequestsRef = useRef(new Map<number, {

    // Recovery要求の新旧を判定するID
    recoveryId: number;
    // Recovery完了と認める最小の一覧取得Request ID
    minimumListRequestId: number;

  }>());

  const latestSummaryRequestIdRef = useRef(0);
  // アンマウント後にサマリーの再取得やState更新を行わないようにする。
  const summaryMountedRef = useRef(false);

  const [keyword, setKeyword] = useState(keywordFromUrl);
  const [appliedKeyword, setAppliedKeyword] = useState(keywordFromUrl);
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  // false = 一覧APIのリクエストは進行中でない、true = 一覧APIのリクエストが進行中
  const [error, setError] = useState<string | null>(null);
  // 更新失敗時も一覧と編集フォームを維持し、入力内容が失われないようにするため、
  // 一覧取得エラーとは別にMutation用のエラー状態を管理する。
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(pageFromUrl);
  const [totalPages, setTotalPages] = useState(0);
  const [first, setFirst] = useState(true);
  const [last, setLast] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // 編集フォームの表示など、UIの再描画に使用する。
  const [editingSession, setEditingSession] = useState<EditingSession | null>(null);
  const [editFieldErrors, setEditFieldErrors] = useState<EditFieldErrors | null>(null);
  const [savingSessionId, setSavingSessionId] = useState<number | null>(null);
  const [editRecoveries, setEditRecoveries] = useState<Record<number, EditRecovery>>({});
  const [statusSummary, setStatusSummary] = useState<ApplicationStatusSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>(statusFromUrl);
  const [appliedStatus, setAppliedStatus] = useState<StatusFilter>(statusFromUrl);
  const [salaryMin, setSalaryMin] = useState<number | null>(null);
  const [salaryMax, setSalaryMax] = useState<number | null>(null);
  const [appliedSalaryMin, setAppliedSalaryMin] = useState<number | null>(null);
  const [appliedSalaryMax, setAppliedSalaryMax] = useState<number | null>(null);
  const [deadlineFrom, setDeadlineFrom] = useState<DeadlineFilter>(null);
  const [deadlineTo, setDeadlineTo] = useState<DeadlineFilter>(null);
  const [deadlineRangeError, setDeadlineRangeError] = useState<string | null>(null);
  const [appliedDeadlineFrom, setAppliedDeadlineFrom] = useState<DeadlineFilter>(null);
  const [appliedDeadlineTo, setAppliedDeadlineTo] = useState<DeadlineFilter>(null);
  const [sorting, setSorting] = useState<JobPostingSorting>(DEFAULT_SORTING);
  // 前回のURLクエリを保持し、POPによるURL変更時にフォーム状態を同期するために使用する。
  const [previousUrlSearch, setPreviousUrlSearch] = useState(currentUrlSearch);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // 戻る・進む操作でURLが変わった場合、検索フォームをURLの状態に同期する。
  if (currentUrlSearch !== previousUrlSearch) {
    setPreviousUrlSearch(currentUrlSearch);

    if (navigationType === 'POP') {
      setKeyword(keywordFromUrl);
      setAppliedKeyword(keywordFromUrl);

      setStatus(statusFromUrl);
      setAppliedStatus(statusFromUrl);

      setCurrentPage(pageFromUrl);
    }
  }

  // 競合検知より後に開始し、実際に反映した一覧だけが再編集制限を解除できる。
  const applyListPage = useCallback((
    page: PageResponse<JobPosting>,
    requestId: number,
  ) => {
    if (requestId !== latestListRequestIdRef.current) {
      return false;
    }

    setJobPostings(page.content);
    setCurrentPage(page.page);
    setTotalPages(page.totalPages);
    setFirst(page.first);
    setLast(page.last);
    // 実際に表示されたページ番号を最新の一覧取得条件に反映する。
    latestListQueryRef.current[2] = page.page;

    const recoveredIds: number[] = [];
    for (const [id, recovery] of recoveryRequestsRef.current) {
      if (
        requestId >= recovery.minimumListRequestId &&
        page.content.some((posting) => posting.id === id)
      ) {
        recoveryRequestsRef.current.delete(id);
        recoveredIds.push(id);
      }
    }

    if (recoveredIds.length > 0) {
      setEditRecoveries((previous) => {
        const next = { ...previous };
        for (const id of recoveredIds) {
          delete next[id];
        }
        return next;
      });
    }

    return true;
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
    background = false,
  ): Promise<ListLoadResult> => {
    const requestId = 
      ++latestListRequestIdRef.current;
    latestListQueryRef.current = [
      searchKeyword, searchFilter, pageNumber, sort,
      salaryMin, salaryMax, deadlineFrom, deadlineTo,
    ];

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
        return { status: 'superseded' };
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
          return { status: 'superseded' };
        }
      }
      /*
      * 求人一覧だけでなく、バックエンドが返したページ情報も
      * Reactの状態に保存する。
      */
      applyListPage(page, requestId);
      return { status: 'updated', content: page.content };
      
    } catch (caughtError) {
      if (
        requestId !== latestListRequestIdRef.current
      ) {
        return { status: 'superseded' };
      }

      const message =
        caughtError instanceof Error
          ? caughtError.message
          : '求人の読み込み中に不明なエラーが発生しました。';

      // 競合復旧の失敗では既存一覧と別セッションの入力を維持する。
      if (!background) {
        setError(message);
      }
      return { status: 'failed', message };
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
    latestListQueryRef.current = [
      keywordFromUrl, statusFromUrl, pageFromUrl,
      DEFAULT_SORTING, null, null, null, null,
    ];

    const loadHistoryData = async () => {
      try {
        let page = await fetchJobPostings(
          keywordFromUrl,
          statusFromUrl,
          pageFromUrl,
          DEFAULT_SORTING,
          null,
          null,
          null,
          null,
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
            DEFAULT_SORTING,
            null,
            null,
            null,
            null,
          );
        }

        if (ignore || requestId !== latestListRequestIdRef.current) {
          return;
        }

        applyListPage(page, requestId);
        setError(null);
      } catch (caughtError) {
        if (ignore || requestId !== latestListRequestIdRef.current) {
          return;
        }

        const message =
          caughtError instanceof Error
            ? caughtError.message
            : '求人の読み込み中に不明なエラーが発生しました。';

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
        caughtError instanceof Error
          ? caughtError.message
          : '応募状況の取得に失敗しました。';
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
    void loadJobPostings(...latestListQueryRef.current);
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

    const nextSearchParams = new URLSearchParams();

    if (nextKeyword !== '') {
      nextSearchParams.set(
        'keyword',
        nextKeyword,
      );
    }

    if (nextStatus !== '') {
      nextSearchParams.set(
        'status',
        nextStatus,
      );
    }

    // 新しい検索のため、page=0はURLから省略する。
    setSearchParams(nextSearchParams);

    setAppliedKeyword(nextKeyword);
    setAppliedStatus(nextStatus);
    setAppliedSalaryMin(nextSalaryMin);
    setAppliedSalaryMax(nextSalaryMax);
    setAppliedDeadlineFrom(nextDeadlineFrom);
    setAppliedDeadlineTo(nextDeadlineTo);

    /*
    * 新しい検索を始めるときは、
    * 前のページ位置に関係なく最初のページから取得する。
    */
    setLoading(true);
    setError(null);

    void loadJobPostings(nextKeyword, nextStatus, 0, sorting, nextSalaryMin, nextSalaryMax, nextDeadlineFrom, nextDeadlineTo);
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
      appliedKeyword,
      appliedStatus,
      currentPage - 1,
      sorting,
      appliedSalaryMin,
      appliedSalaryMax,
      appliedDeadlineFrom,
      appliedDeadlineTo,
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
      appliedKeyword,
      appliedStatus,
      currentPage + 1,
      sorting,
      appliedSalaryMin,
      appliedSalaryMax,
      appliedDeadlineFrom,
      appliedDeadlineTo,
    );
  };


  const handleDelete = async (
    jobPosting: JobPosting,
  ) => {
    const confirmed = window.confirm(
      `「${jobPosting.title}」を削除しますか？`,
    );

    /*
     * ユーザーがキャンセルを押した場合は、
     * DELETE APIを呼び出さない。
     */
    if (!confirmed) {
      return;
    }

    setDeletingId(jobPosting.id);
    setMutationError(null);

    try {
      await deleteJobPosting(jobPosting.id);

      // 最新の検索条件で再取得し、削除後のページ補正は共通処理に任せる。
      await loadJobPostings(...latestListQueryRef.current);
      await loadApplicationStatusSummary();
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : '削除中に不明なエラーが発生しました。';
      // 求人は残っているため、一覧を置き換えるerrorではなく、一覧の上に表示する。
      setMutationError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleStartEdit = (
    jobPosting: JobPosting,
  ) => {
    if (recoveryRequestsRef.current.has(jobPosting.id)) {
      return;
    }

    const session: EditingSession = {
      sessionId: ++nextEditingSessionIdRef.current,
      jobPostingId: jobPosting.id,
      expectedVersion: jobPosting.version,
      jobPosting,
    };
    editingSessionRef.current = session;
    setEditingSession(session);
    setEditFieldErrors(null);
    setError(null);
    setMutationError(null);
  };

  const handleCancelEdit = () => {
    editingSessionRef.current = null;
    setEditingSession(null);
    setEditFieldErrors(null);
    setMutationError(null);
  };

  // 古い非同期応答で新しい編集セッションを終了しないよう、
  // Session IDが一致する場合だけ現在の編集セッションを終了する。
  const finishEditingSession = (sessionId: number) => {
    if (editingSessionRef.current?.sessionId !== sessionId) {
      return false;
    }
    editingSessionRef.current = null;
    setEditingSession(null);
    // 現在のセッションを終了した場合だけ、そのフィールドエラーを消去する。
    setEditFieldErrors(null);
    return true;
  };

  const refreshEditRecovery = async (jobPostingId: number) => {
    const recoveryId = ++nextRecoveryIdRef.current;
    recoveryRequestsRef.current.set(jobPostingId, {
      recoveryId,
      minimumListRequestId: latestListRequestIdRef.current + 1,
    });
    setEditRecoveries((previous) => ({
      ...previous,
      [jobPostingId]: { pending: true, error: null },
    }));

    // 保存開始時の条件ではなく、現在の一覧条件を使用する。
    const result = await loadJobPostings(...latestListQueryRef.current, true);

    if (recoveryRequestsRef.current.get(jobPostingId)?.recoveryId !== recoveryId) {
      return;
    }

    // 最新データが一覧に反映された場合、applyListPageが制限を解除する。
    const message = result.status === 'updated'
      ? '現在の一覧で最新の求人を確認できませんでした。検索条件を確認して再取得してください。'
      : result.status === 'superseded'
        ? '別の検索が実行されました。最新の求人を再読み込みしてから編集してください。'
        : '最新の求人を読み込めませんでした。再読み込みしてから編集してください。';

    setEditRecoveries((previous) => ({
      ...previous,
      [jobPostingId]: { pending: false, error: message },
    }));
  };

  const handleSaveEdit = async (
    session: EditingSession,
    request: UpdateJobPostingRequest,
  ): Promise<void> => {
    if (editingSessionRef.current?.sessionId !== session.sessionId) {
      return;
    }

    setSavingSessionId(session.sessionId);
    setMutationError(null);
    setEditFieldErrors(null);

    try {
      await updateJobPosting(session.jobPostingId, request, session.expectedVersion);

      /*
       * PUTリクエスト成功後、編集モードを終了する。
       */
      finishEditingSession(session.sessionId);

      /*
       * 現在の検索条件とページを維持したまま、
       * サーバーから最新の一覧を再取得する。
       */
      const result = await loadJobPostings(...latestListQueryRef.current, true);
      if (
        result.status === 'failed' &&
        editingSessionRef.current === null &&
        nextEditingSessionIdRef.current === session.sessionId
      ) {
        setMutationError(result.message);
      }
    } catch (caughtError) {
      if (
        isJobPostingVersionConflict(caughtError)
      ) {
        // 再取得が失敗しても、競合したセッションとDraftは再利用しない。
        if (finishEditingSession(session.sessionId)) {
          setMutationError('別の画面で求人が編集されました。');
        }

        await refreshEditRecovery(session.jobPostingId);

        return;
      }

      const message = 
        caughtError instanceof Error
          ? caughtError.message
          : '編集中に不明なエラーが発生しました。';
      if (editingSessionRef.current?.sessionId === session.sessionId) {
        setMutationError(message);
        setEditFieldErrors(caughtError instanceof ApiError
          ? { sessionId: session.sessionId, fieldErrors: caughtError.fieldErrors }
          : null);
      }
      
    } finally {
      setSavingSessionId((currentSessionId) =>
        currentSessionId === session.sessionId ? null : currentSessionId,
      );
    }
  };

  const handleGoBackToHomepage = async () => {
    // Query Parameterを空にする
    setSearchParams({});
    // Form State
    setKeyword('');
    setStatus("");
    setAppliedKeyword('');
    setAppliedStatus("");
    setSalaryMin(null);
    setSalaryMax(null);
    setAppliedSalaryMin(null);
    setAppliedSalaryMax(null);
    setDeadlineFrom(null);
    setDeadlineTo(null);
    setAppliedDeadlineFrom(null);
    setAppliedDeadlineTo(null);
    setShowAdvancedFilters(false);
    setSorting(DEFAULT_SORTING);
    setDeadlineRangeError(null);
    setMutationError(null);
    // Server Data
    setLoading(true);
    setError(null);
    await loadJobPostings('', '', 0, DEFAULT_SORTING, null, null, null, null);
  };

  // 再取得で一覧から外れた場合も、現在編集中のカードとDraftを維持する。
  const visibleJobPostings = editingSession &&
    !jobPostings.some((posting) => posting.id === editingSession.jobPostingId)
    ? [...jobPostings, editingSession.jobPosting]
    : jobPostings;

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
              // 新しい並び順を先に保持し(nextSorting)、UIと以降のレンダリングのために状態へ保存する(setSorting)
              id="sorting"
              value={sorting}
              onChange={(event) => {
                const nextSorting =
                  event.target.value as JobPostingSorting;
                setSorting(nextSorting);

                // 並び順はURLにないため、新しい履歴は作らず、1ページ目に戻ったことだけを反映する。
                const nextSearchParams = new URLSearchParams(searchParams);
                nextSearchParams.delete('page');
                setSearchParams(nextSearchParams, { replace: true });

                setLoading(true);
                setError(null);
                // 今すぐAPIリクエストに使う値
                void loadJobPostings(
                  appliedKeyword,
                  appliedStatus,
                  0,
                  nextSorting,
                  appliedSalaryMin,
                  appliedSalaryMax,
                  appliedDeadlineFrom,
                  appliedDeadlineTo,
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
      ) : visibleJobPostings.length === 0 ? (
        <p>検索結果はありません。</p>
      ) : (
        <>
          {mutationError && (
            <p role="alert">
              {mutationError}
            </p>
          )}

          <ul className="job-posting-list" role="list">
            {visibleJobPostings.map((jobPosting) => (
              <JobPostingListItem
                key={jobPosting.id}
                jobPosting={jobPosting}
                isEditing={
                  editingSession?.jobPostingId === jobPosting.id
                }
                isSaving={
                  editingSession?.jobPostingId === jobPosting.id &&
                  savingSessionId === editingSession.sessionId
                }
                editSessionId={editingSession?.jobPostingId === jobPosting.id
                  ? editingSession.sessionId : undefined}
                expectedVersion={editingSession?.jobPostingId === jobPosting.id
                  ? editingSession.expectedVersion : undefined}
                editFieldErrors={editingSession?.jobPostingId === jobPosting.id &&
                  editFieldErrors?.sessionId === editingSession.sessionId
                  ? editFieldErrors.fieldErrors : undefined}
                editRecovery={editRecoveries[jobPosting.id]}
                onRetryEditRecovery={() => {
                  void refreshEditRecovery(jobPosting.id);
                }}
                isDeleting={
                  deletingId === jobPosting.id
                }
                onStartEdit={handleStartEdit}
                onSave={(id, request) => {
                  if (editingSession?.jobPostingId !== id) {
                    return Promise.resolve();
                  }
                  return handleSaveEdit(editingSession, request);
                }}
                onCancel={handleCancelEdit}
                onDelete={handleDelete}
              />
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
