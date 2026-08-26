import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { 
  deleteJobPosting,
  fetchApplicationStatusSummary,
  fetchJobPostings,
  updateApplicationStatus,
  updateJobPosting,
} from './api/jobPostingApi';
import { 
  type ApplicationStatus,
  type JobPosting,
  type UpdateJobPostingRequest,
  type ApplicationStatusSummaryResponse,
  type StatusFilter,
  type JobPostingSorting,
} from './types/jobPosting';

import JobPostingCreateForm
  from './components/JobPostingCreateForm';

import JobPostingListItem
  from './components/JobPostingListItem';

import ApplicationStatusSummary
  from './components/ApplicationStatusSummary';
  
// 求人情報一覧の初期取得に使用するデフォルトのソート条件
const DEFAULT_SORTING: JobPostingSorting = 'createdAt,desc';

function App() {
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  // false = 현재 목록 API 요청이 진행 중이지 않음, true = 현재 목록 API 요청 진행 중
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [first, setFirst] = useState(true);
  const [last, setLast] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
  const [statusSummary, setStatusSummary] = useState<ApplicationStatusSummaryResponse | null>(null);
  const [status, setStatus] = useState<StatusFilter>("");
  const [appliedStatus, setAppliedStatus] = useState<StatusFilter>("");
  const [sorting, setSorting] = useState<JobPostingSorting>(DEFAULT_SORTING);

  /**
   * 검색어를 받아 백엔드 API를 호출하고,
   * 응답의 content를 화면 상태에 저장한다.
   */
  const loadJobPostings = useCallback(async (
    searchKeyword: string,
    searchFilter: StatusFilter,
    pageNumber: number,
    sort: JobPostingSorting,
  ) => {
    try {
      const page = await fetchJobPostings(
        searchKeyword,
        searchFilter,
        pageNumber,
        sort,
      );
      /*
      * 공고 목록뿐 아니라 백엔드가 반환한 페이지 정보도
      * React 상태에 저장한다.
      */
      setJobPostings(page.content);
      setCurrentPage(page.page);
      setTotalPages(page.totalPages);
      setFirst(page.first);
      setLast(page.last);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : '채용공고를 불러오는 중 알 수 없는 오류가 발생했습니다.';

      setError(message);
    } finally {
      //성공하거나 실패해도 반드시 실행. 버튼 비활성화된 상태 방지
      setLoading(false);
    }
  }, []);

  const loadApplicationStatusSummary = useCallback(async () => {
    try {
      const summary = await fetchApplicationStatusSummary();

      setStatusSummary(summary);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : '지원 상태 요약을 불러오는 데 실패하였습니다.';
      setError(message);
    }
  }, []);

  /*
   * 화면이 처음 열리면 검색어 없이 전체 공고를 조회한다.
   */
  useEffect(() => {
    let ignore = false;

    const loadInitialData = async () => {
      try {
        const [page, summary] = await Promise.all([
          fetchJobPostings('', '', 0, DEFAULT_SORTING),
          fetchApplicationStatusSummary(),
        ]);

        if (ignore) {
          return;
        }

        setJobPostings(page.content);
        setCurrentPage(page.page);
        setTotalPages(page.totalPages);
        setFirst(page.first);
        setLast(page.last);
        setStatusSummary(summary);
      } catch (caughtError) {
        if (ignore) {
          return;
        }

        const message =
          caughtError instanceof Error
            ? caughtError.message
            : '초기 데이터를 불러오는 중 알 수 없는 오류가 발생했습니다.';

        setError(message);
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    void loadInitialData();

    return () => {
      ignore = true;
    };
  }, []);

  const handleSubmit = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const nextKeyword = keyword.trim();
    const nextStatus = status;

    setAppliedKeyword(nextKeyword);
    setAppliedStatus(nextStatus);
    /*
    * 새로운 검색을 시작할 때는
    * 이전 페이지 위치와 관계없이 첫 페이지부터 조회한다.
    */

    setLoading(true);
    setError(null);

    void loadJobPostings(nextKeyword, nextStatus, 0, sorting);
  };


  const handlePreviousPage = () => {
    if (first || loading) {
      return;
    }

    setLoading(true);
    setError(null);

    void loadJobPostings(
      appliedKeyword, 
      appliedStatus,
      currentPage - 1,
      sorting,
    );
  };

  const handleNextPage = () => {
    if (last || loading) {
      return;
    }

    setLoading(true);
    setError(null);

    void loadJobPostings(
      appliedKeyword, 
      appliedStatus,
      currentPage + 1,
      sorting,
    );
  };


  const handleDelete = async (
    jobPosting: JobPosting,
  ) => {
    const confirmed = window.confirm(
      `「${jobPosting.title}」を削除しますか？`,
    );

    /*
     * 사용자가 취소를 누르면
     * DELETE API를 호출하지 않는다.
     */
    if (!confirmed) {
      return;
    }

    setDeletingId(jobPosting.id);
    setError(null);

    try {
      await deleteJobPosting(jobPosting.id);

      /*
       * 현재 페이지에 공고가 한 개뿐이고
       * 첫 페이지가 아니라면,
       * 삭제 후 빈 페이지가 되므로 이전 페이지를 조회한다.
       */
      const pageAfterDelete = 
        jobPostings.length === 1 && currentPage > 0
          ? currentPage - 1
          : currentPage;
      await loadJobPostings(
        appliedKeyword,
        appliedStatus,
        pageAfterDelete,
        sorting,
      );
      await loadApplicationStatusSummary();
    } catch (caughtError) {
      const message = 
        caughtError instanceof Error
          ? caughtError.message
          : '삭제 중 알 수 없는 오류가 발생했습니다.';
      setError(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleJobPostingCreated = async () => {
  /*
   * 등록한 공고가 현재 검색 조건과 일치하지 않아
   * 화면에 보이지 않는 상황을 막기 위해 검색어를 초기화한다.
   */
    setKeyword('');
    setStatus("");
    setAppliedKeyword('');
    setAppliedStatus("");
    setSorting(DEFAULT_SORTING);

  /*
   * 최신 공고부터 첫 페이지를 다시 조회한다.
   */
    await loadJobPostings('', '', 0, DEFAULT_SORTING);
    await loadApplicationStatusSummary();
  };

  const handleStartEdit = (
    jobPosting: JobPosting,
  ) => {
    setEditingId(jobPosting.id);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (
    id: number,
    request: UpdateJobPostingRequest,
  ): Promise<void> => {
    setSavingId(id);
    setError(null);

    try {
      await updateJobPosting(id, request);

      /*
       * PUT 요청 성공 후 수정 모드를 종료
       */
      setEditingId(null);

      /*
       * 현재 검색어와 페이지를 유지하며
       * 서버의 최신 목록을 다시 가져온다
       */
      await loadJobPostings(
        appliedKeyword,
        appliedStatus,
        currentPage,
        sorting,
      );
    } catch (caughtError) {
      const message = 
        caughtError instanceof Error
          ? caughtError.message
          : '수정 중 알 수 없는 오류가 발생했습니다.';
      setError(message);
    } finally {
      setSavingId(null);
    }
  };

  const handleApplicationStatusChange = async (
    id: number,
    status: ApplicationStatus,
  ): Promise<void> => {
    setUpdatingStatusId(id);
    setError(null);

    try {
      await updateApplicationStatus(id, { status });

      await loadJobPostings(
        appliedKeyword,
        appliedStatus,
        currentPage,
        sorting,
      );

      await loadApplicationStatusSummary();

    } catch (caughtError) {
      const message = 
        caughtError instanceof Error
          ? caughtError.message
          : '상태 업데이트에 실패하였습니다.';
        setError(message);
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleGoBackToHomepage = async () => {

    setKeyword('');
    setStatus("");
    setAppliedKeyword('');
    setAppliedStatus("");
    setSorting(DEFAULT_SORTING);

    await loadJobPostings('', '', 0, DEFAULT_SORTING);
  };
                                                                                                                                                                                                                                                                                                                                                                                                                                                                          
  return (
    <main>
      <h1>
        <button
          type="button"
          className="home-title-button"
          onClick={handleGoBackToHomepage}
        >
          JobLens Japan
        </button>
      </h1>

      <JobPostingCreateForm
      onCreated={handleJobPostingCreated}
      />

      {statusSummary && (
        <ApplicationStatusSummary
          summary={statusSummary}
        />
      )}

      <hr />

      <h2>채용공고 검색</h2>

      <form onSubmit={handleSubmit}>
        <label htmlFor='search'>검색어</label>
        <input
          id='search'
          type="text"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="AWS, Java, 회사명 검색"
        />

        <label htmlFor="status">상태</label>
        <select
          id="status"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as StatusFilter)
          }
        >
          <option value="">
            전체
          </option>
          <option value="SAVED">
            저장
          </option>
          <option value="APPLIED">
            지원완료
          </option>
          <option value="INTERVIEWING">
            면접진행중
          </option>
          <option value="OFFERED">
            오퍼수령
          </option>
          <option value="REJECTED">
            거절됨
          </option>
          
        </select>
        
        <label htmlFor="sorting">정렬</label>
        <select
        // 새로운 정렬값을 먼저 보관(nextSorting), UI와 이후의 렌더링을 위한 상태 저장(setSorting)
         id="sorting"
         value={sorting}
         onChange={(event) => {
          const nextSorting = 
            event.target.value as JobPostingSorting;
          setSorting(nextSorting);

          setLoading(true);
          setError(null);
          // 지금 당장 API 요청에 사용할 값
          void loadJobPostings(
            appliedKeyword,
            appliedStatus,
            0,
            nextSorting,
          );
         }} 
        >
          <option value='createdAt,desc'>
            최신순
          </option>
          <option value='createdAt,asc'>
            오래된순
          </option>
          <option value='companyName,asc'>
            회사명순
          </option>
        </select>

        <button type="submit"
                disabled={loading}
        >
          {loading ? '검색 중...' : '검색'}
        </button>
      </form>

      {loading ? (
        <p role="status">
        채용공고를 불러오는 중...
        </p>
      ) : error ? (
        <p role="alert">
          {error}
        </p>
      ) : jobPostings.length === 0 ? (
        <p>검색 결과가 없습니다.</p>
      ) : (
        <ul>
          {jobPostings.map((jobPosting) => (
            <JobPostingListItem
              key={jobPosting.id}
              jobPosting={jobPosting}
              isEditing={
                editingId === jobPosting.id
              }
              isSaving={
                savingId === jobPosting.id
              }
              isDeleting={
                deletingId === jobPosting.id
              }
              onStartEdit={handleStartEdit}
              onSave={handleSaveEdit}
              onCancel={handleCancelEdit}
              onDelete={handleDelete}
              isUpdatingStatus={
                updatingStatusId === jobPosting.id
              }
              onApplicationStatusChange={
                handleApplicationStatusChange
              }
            />
          ))}
        </ul>        
      )}

      {!error && totalPages > 0 && (
        <div>
          <button
            type="button"
            onClick={handlePreviousPage}
            disabled={first || loading}
          >
            이전
          </button>

          <span>
            {currentPage + 1} / {totalPages}
          </span>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={last || loading}
          >
            다음
          </button>
        </div>
      )}
    </main>
  );
}

export default App;