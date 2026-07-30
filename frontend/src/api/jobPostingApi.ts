import type {
  CreateJobPostingRequest,
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

/**
 * 새로운 채용공고를 백엔드에 등록한다.
 */
export async function createJobPosting(
  request:CreateJobPostingRequest,
): Promise<JobPosting> {
  const response = await fetch('api/job-postings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    /*
     * JavaScript 객체를 HTTP 요청 본문으로 보내기 위해
     * JSON 문자열로 변환한다.
     */
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `채용공고 등록에 실패했습니다. ` +
        `status=${response.status}, body=${errorBody}`,
    );
  }

  return (await response.json()) as JobPosting;
}