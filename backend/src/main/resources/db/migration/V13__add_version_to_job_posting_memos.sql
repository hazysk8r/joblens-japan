-- 同じメモを2つの画面で編集したとき、後の保存で先の変更が黙って消えないよう、バージョンで競合を検出する。
ALTER TABLE job_posting_memos
ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
