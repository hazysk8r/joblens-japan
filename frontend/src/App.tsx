import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { fetchJobPostings } from './api/jobPostingApi';
import type { JobPosting } from './types/jobPosting';

function App() {
  const [keyword, setKeyword] = useState('');
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [first, setFirst] = useState(true);
  const [last, setLast] = useState(true);

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

  return (
    <main>
      <h1>JobLens Japan</h1>

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
            <h2>{jobPosting.title}</h2>

            <p>
              {jobPosting.companyName ?? '회사명 미등록'}
            </p>

            <p>{jobPosting.originalText}</p>
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