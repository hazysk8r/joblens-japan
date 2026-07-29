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
  page: number,
): Promise<PageResponse<JobPosting>> {
  const params = new URLSearchParams({
    /*
     * React가 관리하는 현재 페이지 번호를 API에 전달한다.
     * 백엔드의 페이지 번호는 0부터 시작한다.
     */
    page: page.toString(),
    size: '5',
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