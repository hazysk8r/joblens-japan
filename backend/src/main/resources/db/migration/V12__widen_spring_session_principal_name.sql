-- ログイン中のセッションにはメールアドレスがPRINCIPAL_NAMEとして保存される。
-- users.emailは254文字まで登録できるため、セッション側も同じ長さを保存できるようにする。
ALTER TABLE SPRING_SESSION
  ALTER COLUMN PRINCIPAL_NAME TYPE VARCHAR(254);
