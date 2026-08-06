import type {
  CreateJobPostingRequest,
  UpdateJobPostingRequest,
  JobPosting,
  PageResponse,
  UpdateApplicationStatusRequest,
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

/**
 * 지정한 ID의 채용공고를 삭제한다.
 */
export async function deleteJobPosting(
  id: number,
): Promise<void> {
  const response = await fetch(
    `/api/job-postings/${id}`,
    {
      method: 'DELETE',
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `채용공고 삭제에 실패했습니다.` + 
        `status=${response.status}, body=${errorBody}`,
    );
  }

  /*
   * 삭제 성공 응답은 204 No Content이므로
   * response.json()을 호출하지 않는다.
   */
}

export async function updateJobPosting(
  id: number,
  request: UpdateJobPostingRequest,
): Promise<JobPosting> {
  const response = await fetch(
    `/api/job-postings/${id}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `채용공고 수정에 실패했습니다. ` + 
        `status=${response.status}, body =${errorBody}`,
    );
  }

  return (await response.json()) as JobPosting;
}

export async function updateApplicationStatus(
  id: number,
  request: UpdateApplicationStatusRequest,
): Promise<JobPosting> {
  const response = await fetch(
    `/api/job-postings/${id}/status`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `지원 상태 변경에 실패하였습니다. ` + 
        `status=${response.status}, body=${errorBody}`,
    );
  }

  return (await response.json()) as JobPosting;
}

