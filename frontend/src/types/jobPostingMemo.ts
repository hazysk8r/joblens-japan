
export interface JobPostingMemo {
  id: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobPostingMemoRequest {
  content: string;
}

export interface UpdateJobPostingMemoRequest {
  content: string;
}