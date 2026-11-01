# Dockerスモークテストの接続エラー

`docker-smoke.sh check`はホストのPythonから、CI専用Composeの公開ポートに接続する。
WindowsでCodexから実行するときは、Dockerのポート取得とPythonのHTTP確認を含む
`check`コマンド全体に、Dockerとローカルネットワークへのアクセス許可が必要になる。

この環境では、制限された実行で静的JSへの`socket.connect()`が`WinError 10014`になった。
同じPython・同じ接続先を制限の外で実行すると通過した。`10014`自体はWinsockの
`WSAEFAULT`であり、番号だけで権限不足やバックエンドの障害とは判断できない。
再発した場合は、同じコマンドを通常のターミナル、またはアクセスを許可した実行で比較する。
スモークのためにアプリのセキュリティ設定を変更する必要はない。

詳細なスタックトレースは、既存のCI用環境変数を設定した状態で次のように取得する。

```bash
SMOKE_DEBUG=1 bash scripts/ci/docker-smoke.sh check
```

Pythonを直接実行する場合は`--debug`を付ける。通常のログにも例外の種類と
`errno`・`winerror`を残すため、HTTPエラーとソケットエラーを区別できる。
接続・送信・応答読み取りの失敗は即座に失敗とし、POSTを自動再送しない。
会員登録や求人作成を行うため、再実行には新しいCI専用DBを使う。
