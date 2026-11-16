# セキュリティ対策

<!-- 下書き：各項目の「（記入）」を、自分の言葉で書き換えてください。「根拠」の行は確認用のメモで、書き終えたら残すかどうか決めます。 -->

JobLens Japanで行っているセキュリティ対策と、その理由をまとめています。
各項目は「何を防ぐか」「なければ何が起きるか」「どう実装したか」「どう確認したか」の順に書いています。

## 1. 所有者の確認

### 1.1 求人票は必ず所有者で絞り込んで取得する

- **何を防ぐか**：ほかのユーザーの求人票を見たり、編集・削除したり、メモを書いたりすること（IDOR、OWASP API Security Top 10のBOLA）。
- **なければ何が起きるか**：求人票のIDは連番のため、URLの数字を変えるだけで、ほかのユーザーの求人票を順に読めてしまう。取得の処理は編集や削除でも使うため、読めるだけでなく書き換えや削除もできてしまう。
- **どう実装したか**：求人票はIDだけで取得せず、必ずログイン中のユーザーのIDと組み合わせて取得する（`findByIdAndUserId`）。メモや変更履歴も、まず親の求人票が自分のものかを同じ条件で確かめてから扱う（`findByIdAndUserId`、`existsByIdAndUserId`）。
- **どう確認したか**：別のユーザーの求人票に対して、取得・編集・応募状況の変更・削除・分析・履歴・メモのそれぞれで404になり、データが変わらないことをテストしている。一覧・検索・件数集計に自分の求人票しか出ないことも確認している。

> 根拠：`JobPostingRepository`（`findByIdAndUserId`）、`JobPostingOwnershipTest`

### 1.2 ほかのユーザーの求人票には403ではなく404を返す

- **何を防ぐか**：ほかのユーザーの求人票が「存在すること」が知られること。
- **なければ何が起きるか**：403（権限なし）を返すと、「そのIDの求人票はあるが自分のものではない」と分かる。IDを順に試せば、どのIDに求人票があるかや、サービス全体の件数が分かってしまう。
- **どう実装したか**：存在しない求人票と、ほかのユーザーの求人票を区別せず、同じ404と同じメッセージを返す。また、所有者の確認をほかのどの確認よりも先に行う。たとえば編集では、If-Matchのバージョンの確認より先に所有者を確認する。順番が逆だと、バージョンが違うときの412から、求人票があることや、今のバージョン（何回編集されたか）が分かってしまうため。
- **どう確認したか**：存在しない求人票とほかのユーザーの求人票で、応答が同じになることをテストしている。誤ったIf-Matchで編集や応募状況の変更をしても、412ではなく404になることもテストしている。
- **選ばなかった案**：403は「権限がない」ことを正確に伝えられるが、存在を知らせてしまう。管理画面のように存在を知られても問題ないものなら403でよいが、個人の求人票は存在自体が情報になるため404にした（GitHubも、権限のない非公開リポジトリには404を返す）。

> 根拠：`JobPostingNotFoundException`、`JobPostingOwnershipTest`

### 1.3 別のタブでアカウントが切り替わったときの変更を止める

- **何を防ぐか**：前のユーザーの画面から送られた変更が、新しくログインしたユーザーのデータとして保存されること。攻撃ではなく、共有のパソコンなどで起こる事故への対策。
- **なければ何が起きるか**：セッションCookieはすべてのタブで共有される。タブ1でAさんの画面を開いたまま、タブ2でBさんがログインすると、タブ1から保存したAさんのメモや求人票は、Bさんのセッションで処理され、Bさんのアカウントに保存されてしまう。
- **どう実装したか**：
  - フロントエンドは、データを変更するリクエストに、画面が想定しているユーザーのIDを `X-Expected-User-Id` ヘッダーで付ける。サーバーはセッションのユーザーと照合し、違えば処理せずに409を返す。
  - このヘッダーは認証には使わない。認証と所有者の確認は常にセッションのユーザーで行う。ヘッダーを省略したり書き換えたりしても、自分のセッションで自分のデータを変更できるだけで、ほかのユーザーのデータには届かない。そのため、ヘッダーがないときは照合しない。
  - あわせて、ログイン・ログアウトしたタブは `localStorage` の変更でほかのタブに知らせ、知らせを受けたタブはサーバーにログイン状態を確認し直す。ただし知らせが届く前に送られたリクエストは防げないため、最後はサーバーの照合で止める。
- **どう確認したか**：ヘッダーのユーザーがセッションのユーザーと違う場合や、数値でない場合に409になり、データが変わらないことをテストしている。同じユーザーなら処理されること、取得・ログイン・会員登録は照合しないことも確認している。

> 根拠：`ExpectedUserInterceptor`（`X-Expected-User-Id`）、`ExpectedUserCheckTest`、`frontend/src/api/apiClient.ts`、`frontend/src/auth/authSync.ts`

> 根拠：`ExpectedUserInterceptor`（`X-Expected-User-Id`）、`ExpectedUserCheckTest`

## 2. CSRF対策

### 2.1 CookieとヘッダーのトークンでCSRFを防ぐ

- **何を防ぐか**：（記入）
- **なければ何が起きるか**：（記入）
- **どう実装したか**：（記入）
- **どう確認したか**：（記入）

> 根拠：`SecurityConfig`（`csrf.spa()`、`CookieCsrfTokenRepository.withHttpOnlyFalse()`）、`SecurityAccessTest`

### 2.2 ログインのときにCSRFトークンを発行し直す

- **何を防ぐか**：（記入）
- **どう実装したか**：（記入）

> 根拠：`LoginSessionManager`、`AuthControllerTest`

## 3. 認証とセッション

### 3.1 JWTではなくサーバー側のセッションを使う

- **選んだ理由**：（記入）
- **選ばなかった案**：（記入）

> 根拠：`SecurityConfig`、Spring Session JDBC（`V10__create_users_and_sessions.sql`）

### 3.2 セッションCookieの属性

- **HttpOnly**：（記入）
- **SameSite=Lax**：（記入）
- **Secure（既定でtrue）**：（記入）

> 根拠：`SessionCookieConfig`、`SessionCookieSecureDisabledTest`

### 3.3 セッション固定攻撃の対策

- **何を防ぐか**：（記入）
- **どう実装したか**：（記入）

> 根拠：`LoginSessionManager`（`changeSessionId`）

### 3.4 パスワードの保存と退会

- **パスワード**：（記入）
- **退会**：（記入）

> 根拠：`SecurityConfig`（`createDelegatingPasswordEncoder`）、`AuthService.deleteAccount`、`AccountDeletionIntegrationTest`

## 4. 使いすぎ・悪用の防止

### 4.1 リクエスト数の制限（レート制限）

- **何を防ぐか**：（記入）
- **どう実装したか**：（記入）
- **どう確認したか**：（記入）

> 根拠：`frontend/nginx.conf`（ログイン5回/分、会員登録1回/分、退会5回/分、書き込み30回/分。いずれもIPアドレスごと）、`check_docker_smoke.py`（`check_auth_rate_limits`、`check_account_delete_rate_limit`、`check_write_rate_limit`）

### 4.2 リクエストサイズと保存量の上限

- **何を防ぐか**：（記入）
- **どう実装したか**：（記入）
- **どう確認したか**：（記入）

> 根拠：`nginx.conf`（`client_max_body_size 1m`）、`application.yaml`（`joblens.limits`、`max-page-size: 20`）、`check_body_size_limit`、`UsageLimitTest`、`SignupLimitTest`

## 5. ブラウザ側の対策

### 5.1 Content Security Policyとセキュリティヘッダー

- **何を防ぐか**：（記入）
- **どう実装したか**：（記入）
- **どう確認したか**：（記入）

> 根拠：`frontend/security-headers.conf`、`check_security_headers`

### 5.2 求人票の元URLはhttpとhttpsだけを受け付ける

- **何を防ぐか**：（記入）
- **なければ何が起きるか**：（記入）
- **どう確認したか**：（記入）

> 根拠：`ValidHttpUrl`、`HttpUrlValidatorTest`

### 5.3 画面への表示と外部リンク

- **表示**：（記入）
- **外部リンク**：（記入）

> 根拠：`dangerouslySetInnerHTML` を使っていない、`rel="noreferrer"`（`JobPostingListItem`、`JobPostingDetailPage`）

## 6. エラー応答と公開範囲

- **エラー応答**：（記入）
- **公開しないもの**：（記入）

> 根拠：`GlobalExceptionHandler`、`ErrorResponseIntegrationTest`、`check_spring_error_format`、`nginx.conf`（`server_tokens off`、`/actuator` は404）

## 7. 分かっている限界と、公開時に行うこと

### 7.1 選んで残している限界

- **会員登録で、登録済みのメールアドレスが分かる**：（記入）
- **レート制限はIPアドレスごと**：（記入）
- **全体のユーザー数の上限（100人）**：（記入）
- **入力中の下書きをブラウザに保存している**：（記入）

### 7.2 まだ確認していないこと

- **利用者の入力に使う正規表現（ReDoS）**：（記入）

### 7.3 公開時に行うこと

- （記入：HSTS、プロキシヘッダー、データベースとActuatorの公開範囲など）
