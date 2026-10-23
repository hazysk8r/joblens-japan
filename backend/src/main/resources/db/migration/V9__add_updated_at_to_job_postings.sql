-- 既存の求人は最終更新日時が不明なため、登録日時を初期値として設定する。
ALTER TABLE job_postings
ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE;

UPDATE job_postings
SET updated_at = created_at;

ALTER TABLE job_postings
ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN updated_at SET NOT NULL;
