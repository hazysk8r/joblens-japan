CREATE TABLE job_postings (
    id BIGSERIAL PRIMARY KEY,
    company_name VARCHAR(200),
    title VARCHAR(200) NOT NULL,
    source_url TEXT,
    original_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);