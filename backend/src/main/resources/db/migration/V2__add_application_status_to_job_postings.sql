ALTER TABLE job_postings
ADD COLUMN application_status VARCHAR(20)
    DEFAULT 'SAVED'
    NOT NULL;