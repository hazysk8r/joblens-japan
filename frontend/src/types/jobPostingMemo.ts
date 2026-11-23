
export interface JobPostingMemo {
  id: number;
  content: string;
  createdAt: string;
  updatedAt: string;
  // 編集のときにIf-Matchで送り返すバージョン。
  version: number;
}

export interface CreateJobPostingMemoRequest {
  content: string;
}

export interface UpdateJobPostingMemoRequest {
  content: string;
}