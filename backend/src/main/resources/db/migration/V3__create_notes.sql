CREATE TABLE job_posting_memos (
  id BIGSERIAL PRIMARY KEY,
  content VARCHAR(250) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  job_posting_id BIGINT NOT NULL,
  FOREIGN KEY (job_posting_id) REFERENCES job_postings(id) ON DELETE CASCADE
);

CREATE INDEX idx_job_posting_memos_job_posting_id
  ON job_posting_memos(job_posting_id);