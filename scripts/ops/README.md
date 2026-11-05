# 登録者数の上限に達したときの対応

全体の登録者数が上限(`joblens.limits.max-users`)に達すると、新規登録だけが止まり、
バックエンドのログに次の警告が残る。既存のユーザーはそのまま利用できる。

```text
会員登録の上限に達しました: 上限=100人
```

悪用で上限まで埋められると、新しい利用者が登録できなくなる。
自動では削除しないため、警告に気付いたら次の手順で確認する。

## 1. 登録状況を確認する

DBのバックアップまたはスナップショットを取ってから、登録日時と求人数を確認する。

```sql
SELECT u.id, u.email, u.created_at, count(j.id) AS postings
FROM users u
LEFT JOIN job_postings j ON j.user_id = u.id
GROUP BY u.id
ORDER BY u.created_at;
```

## 2. 不要なユーザーを削除する

求人・メモ・状態履歴は`ON DELETE CASCADE`で一緒に削除され、元に戻せない。
セッションには外部キーがないため、同じトランザクションで明示的に削除する。

```sql
BEGIN;
DELETE FROM spring_session WHERE principal_name = '対象のメールアドレス';
DELETE FROM users WHERE email = '対象のメールアドレス';
COMMIT;
```

## 3. 登録できることを確認する

`SELECT count(*) FROM users;`が上限より小さいことを確認する。
警告が続く場合は、登録の増え方とNginxのアクセスログから接続元を確認し、上限やNginxの回数制限を見直す。
