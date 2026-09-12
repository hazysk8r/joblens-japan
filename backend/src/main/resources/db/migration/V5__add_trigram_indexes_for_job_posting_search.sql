CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_job_postings_title_trgm
ON job_postings USING GIN (lower(title) gin_trgm_ops);

CREATE INDEX idx_job_postings_company_name_trgm
ON job_postings USING GIN (lower(company_name) gin_trgm_ops);

CREATE INDEX idx_job_postings_original_text_trgm
ON job_postings USING GIN (lower(original_text) gin_trgm_ops);