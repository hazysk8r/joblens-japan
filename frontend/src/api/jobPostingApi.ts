import type {
  JobPosting,
  PageResponse,
} from '../types/jobPosting';

/**
 * 백엔드의 채용공고 목록 API를 호출한다.
 *
 * keyword가 비어 있으면 전체 목록을 조회하고,
 * 값이 있으면 해당 키워드로 검색한다.
 */
export async function fetchJobPostings(
  keyword: string,
): Promise<PageResponse<JobPosting>> {
  const params = new URLSearchParams({
    page: '0',
    size: '10',
    sort: 'id,desc',
  });

  const normalizedKeyword = keyword.trim();

  if (normalizedKeyword) {
    params.set('keyword', normalizedKeyword);
  }

  const response = await fetch(
    `/api/job-postings?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error(
      `채용공고 조회에 실패했습니다. status=${response.status}`,
    );
  }

  return (await response.json()) as PageResponse<JobPosting>;
}