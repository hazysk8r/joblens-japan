import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { 
  deleteJobPosting,
  fetchJobPostings,
  updateJobPosting,
} from './api/jobPostingApi';
import type { JobPosting } from './types/jobPosting';

import JobPostingCreateForm
  from './components/JobPostingCreateForm';


function App() {
  const [keyword, setKeyword] = useState('');
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [first, setFirst] = useState(true);
  const [last, setLast] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    companyName:'',
    title:'',
    sourceUrl:'',
    originalText:'',
  });
  const [savingId, setSavingId] = useState<number | null>(null);

  /**
   * 검색어를 받아 백엔드 API를 호출하고,
   * 응답의 content를 화면 상태에 저장한다.
   */
  const loadJobPostings = async (
    searchKeyword: string,
    pageNumber: number,
  ) => {
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
          : '알 수 없는 오류가 발생했습니다.';

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  /*
   * 화면이 처음 열리면 검색어 없이 전체 공고를 조회한다.
   */
  useEffect(() => {
    /*
    * 화면을 처음 열었을 때
    * 검색어 없이 첫 번째 페이지를 조회한다.
    */
    void loadJobPostings('', 0);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    /*
    * 새로운 검색을 시작할 때는
    * 이전 페이지 위치와 관계없이 첫 페이지부터 조회한다.
    */
    void loadJobPostings(keyword, 0);
  };

  const handlePreviousPage = () => {
    if (first) {
      return;
    }

    void loadJobPostings(keyword, currentPage - 1);
  };

  const handleNextPage = () => {
    if (last) {
      return;
    }

    void loadJobPostings(keyword, currentPage + 1);
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
        keyword,
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

  /*
   * 최신 공고부터 첫 페이지를 다시 조회한다.
   */
    await loadJobPostings('', 0);
  };

  const handleStartEdit = (
    jobPosting: JobPosting,
  ) => {
    setEditingId(jobPosting.id);

    setEditForm({
      companyName: jobPosting.companyName ?? '',
      title: jobPosting.title,
      sourceUrl: jobPosting.sourceUrl ?? '',
      originalText: jobPosting.originalText,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);

    setEditForm({
      companyName: '',
      title: '',
      sourceUrl: '',
      originalText: '',
    });
  };

  const handleSaveEdit = async (
    id: number,
  ) => {
    const trimmedTitle = editForm.title.trim();
    const trimmedOriginalText =
      editForm.originalText.trim();

    /*
    * 백엔드 요청 전에 필수 입력값을 확인한다.
    */
    if (!trimmedTitle || !trimmedOriginalText) {
      setError(
        '공고 제목과 공고 원문을 입력해 주세요.',
      );
      return;
    }

    setSavingId(id);
    setError(null);

    try {
      await updateJobPosting(id, {
        companyName:
          editForm.companyName.trim() || null,
        title: trimmedTitle,
        sourceUrl:
          editForm.sourceUrl.trim() || null,
        originalText: trimmedOriginalText,
      });

      /*
      * 수정 모드를 종료한다.
      */
      setEditingId(null);

      /*
      * 현재 검색어와 페이지를 유지하면서
      * 수정된 목록을 다시 조회한다.
      */
      await loadJobPostings(
        keyword,
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

        <button type="submit">검색</button>
      </form>

      {loading && <p>불러오는 중...</p>}

      {error && <p>{error}</p>}

      {!loading && !error && jobPostings.length === 0 && (
        <p>검색 결과가 없습니다.</p>
      )}

      <ul>
        {jobPostings.map((jobPosting) => (
          <li key={jobPosting.id}>
            {editingId === jobPosting.id ? (
              /*
              * 현재 공고가 수정 중이면
              * 편집 폼을 표시한다.
              */
              <form
                onSubmit={(event) => {
                  event.preventDefault();

                  void handleSaveEdit(
                    jobPosting.id,
                  );
                }}
              >
                <div>
                  <label
                    htmlFor={`edit-company-${jobPosting.id}`}
                  >
                    회사명
                  </label>

                  <input
                    id={`edit-company-${jobPosting.id}`}
                    type="text"
                    value={editForm.companyName}
                    onChange={(event) => {
                      setEditForm((previous) => ({
                        ...previous,
                        companyName:
                          event.target.value,
                      }));
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor={`edit-title-${jobPosting.id}`}
                  >
                    공고 제목
                  </label>

                  <input
                    id={`edit-title-${jobPosting.id}`}
                    type="text"
                    value={editForm.title}
                    onChange={(event) => {
                      setEditForm((previous) => ({
                        ...previous,
                        title: event.target.value,
                      }));
                    }}
                    required
                  />
                </div>

                <div>
                  <label
                    htmlFor={`edit-url-${jobPosting.id}`}
                  >
                    공고 URL
                  </label>

                  <input
                    id={`edit-url-${jobPosting.id}`}
                    type="url"
                    value={editForm.sourceUrl}
                    onChange={(event) => {
                      setEditForm((previous) => ({
                        ...previous,
                        sourceUrl:
                          event.target.value,
                      }));
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor={`edit-text-${jobPosting.id}`}
                  >
                    공고 원문
                  </label>

                  <textarea
                    id={`edit-text-${jobPosting.id}`}
                    value={editForm.originalText}
                    onChange={(event) => {
                      setEditForm((previous) => ({
                        ...previous,
                        originalText:
                          event.target.value,
                      }));
                    }}
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={
                    savingId === jobPosting.id
                  }
                >
                  {savingId === jobPosting.id
                    ? '저장 중...'
                    : '저장'}
                </button>

                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={
                    savingId === jobPosting.id
                  }
                >
                  취소
                </button>
              </form>
            ) : (
              /*
              * 수정 중이 아니면 기존 공고 내용을 표시한다.
              */
              <>
                <h2>{jobPosting.title}</h2>

                <p>
                  {jobPosting.companyName ??
                    '회사명 미등록'}
                </p>

                {jobPosting.sourceUrl && (
                  <p>
                    <a
                      href={jobPosting.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      원문 보기
                    </a>
                  </p>
                )}

                <p>{jobPosting.originalText}</p>

                <button
                  type="button"
                  onClick={() => {
                    handleStartEdit(jobPosting);
                  }}
                >
                  수정
                </button>

                <button
                  type="button"
                  onClick={() => {
                    void handleDelete(jobPosting);
                  }}
                  disabled={
                    deletingId === jobPosting.id
                  }
                >
                  {deletingId === jobPosting.id
                    ? '삭제 중...'
                    : '삭제'}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {!loading && !error && totalPages > 0 && (
        <div>
          <button
            type="button"
            onClick={handlePreviousPage}
            disabled={first}
          >
            이전
          </button>

          <span>
            {currentPage + 1} / {totalPages}
          </span>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={last}
          >
            다음
          </button>
        </div>
      )}
    </main>
  );
}

export default App;