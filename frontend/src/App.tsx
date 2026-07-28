import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { fetchJobPostings } from './api/jobPostingApi';
import type { JobPosting } from './types/jobPosting';

function App() {
  const [keyword, setKeyword] = useState('');
  const [jobPostings, setJobPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 검색어를 받아 백엔드 API를 호출하고,
   * 응답의 content를 화면 상태에 저장한다.
   */
  const loadJobPostings = async (searchKeyword: string) => {
    setLoading(true);
    setError(null);

    try {
      const page = await fetchJobPostings(searchKeyword);
      setJobPostings(page.content);
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
    void loadJobPostings('');
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void loadJobPostings(keyword);
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
    </main>
  );
}

export default App;