//백엔드의 JSON 응답 구조를 typescript로 표현한 것
export interface JobPosting {
  id: number;
  companyName: string | null;
  title: string;
  sourceUrl: string | null;
  originalText: string;
  createdAt: string;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}