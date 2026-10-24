-- 所有者のいない既存の求人は開発用データのため削除する。
-- メモと状態履歴はON DELETE CASCADEで一緒に削除される。
DELETE FROM job_postings;

-- ユーザーを削除した場合は、そのユーザーの求人(とメモ・状態履歴)も削除する。
ALTER TABLE job_postings
ADD COLUMN user_id BIGINT NOT NULL,
ADD CONSTRAINT fk_job_postings_user
  FOREIGN KEY (user_id)
  REFERENCES users(id)
  ON DELETE CASCADE;

-- 一覧は常にユーザーで絞り込んでから登録日時で並べ替えるため。
CREATE INDEX idx_job_postings_user_id_created_at
  ON job_postings(user_id, created_at);
