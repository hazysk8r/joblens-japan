CREATE TABLE job_posting_status_histories (
  id BIGSERIAL PRIMARY KEY,
  job_posting_id BIGINT NOT NULL,
  from_status VARCHAR(20) NOT NULL,
  to_status VARCHAR(20) NOT NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_job_posting_status_histories_job_posting
    FOREIGN KEY (job_posting_id)
    REFERENCES job_postings(id)
    ON DELETE CASCADE
);

CREATE INDEX idx_job_posting_status_histories_job_posting_id
  ON job_posting_status_histories(job_posting_id);