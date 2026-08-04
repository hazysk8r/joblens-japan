import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { 
  deleteJobPosting,
  fetchJobPostings,
  updateJobPosting,
} from './api/jobPostingApi';
import type { 
  JobPosting,
  UpdateJobPostingRequest,
} from './types/jobPosting';

import JobPostingCreateForm
  from './components/JobPostingCreateForm';

import JobPostingListItem
  from './components/JobPostingListItem';


function App() {
  const [keyword, setKeyword] = useState('');
  const [appliedKeyword, setAppliedKeyword] = useState('');
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(false);
  // false = 현재 목록 API 요청이 진행 중이지 않음, true = 현재 목록 API 요청 진행 중
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [first, setFirst] = useState(true);
  const [last, setLast] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);

  /**
   * 검색어를 받아 백엔드 API를 호출하고,
   * 응답의 content를 화면 상태에 저장한다.
   */
  const loadJobPostings = useCallback(async (
    searchKeyword: string,
    pageNumber: number,
  ) => {
    /*
     * API 요청을 시작하기 직전에
     * 목록을 로딩 중인 상태로 변경
     */
    setLoading(true);
    setError(null);

    try {
      const page = await fetchJobPostings(
        searchKeyword,
        pageNumber,
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

  /*
   * 화면이 처음 열리면 검색어 없이 전체 공고를 조회한다.
   */
  useEffect(() => {
    /*
    * 화면을 처음 열었을 때
    * 검색어 없이 첫 번째 페이지를 조회한다.
    */
    void loadJobPostings('', 0);
  }, [loadJobPostings]);

  const handleSubmit = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const nextKeyword = keyword.trim();

    setAppliedKeyword(nextKeyword);
    /*
    * 새로운 검색을 시작할 때는
    * 이전 페이지 위치와 관계없이 첫 페이지부터 조회한다.
    */
    void loadJobPostings(nextKeyword, 0);
  };

  const handlePreviousPage = () => {
    if (first || loading) {
      return;
    }

    void loadJobPostings(
      appliedKeyword, 
      currentPage - 1,
    );
  };

  const handleNextPage = () => {
    if (last || loading) {
      return;
    }

    void loadJobPostings(
      appliedKeyword, 
      currentPage + 1,
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
        pageAfterDelete,
      );
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
    setAppliedKeyword('');

  /*
   * 최신 공고부터 첫 페이지를 다시 조회한다.
   */
    await loadJobPostings('', 0);
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
        currentPage,
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
  
                                                                                                                                                                                                                                                                                                                                                                                                                                                                          
  return (
    <main>
      <h1>JobLens Japan</h1>

      <JobPostingCreateForm
      onCreated={handleJobPostingCreated}
      />

      <hr />

      <h2>채용공고 검색</h2>

      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="AWS, Java, 회사명 검색"
        />

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