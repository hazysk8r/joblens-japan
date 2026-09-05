ALTER TABLE job_postings
  ADD COLUMN salary_min INTEGER,
  ADD COLUMN salary_max INTEGER,
  ADD CONSTRAINT chk_salary_min_non_negative
    CHECK (salary_min >= 0),
  ADD CONSTRAINT chk_salary_max_non_negative
    CHECK (salary_max >= 0),
  ADD CONSTRAINT chk_salary_range
    CHECK (salary_min <= salary_max);