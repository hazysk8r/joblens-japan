import './AuthCheckStatus.css';

/**
 * 起動時のログイン状態の確認中・確認失敗を表示する。
 * 確認が終わるまでは、ログイン画面にもログインが必要な画面にも移動しない。
 */
function AuthCheckStatus({
  status,
  onRetry,
}: {
  status: 'loading' | 'error';
  onRetry: () => void;
}) {
  return (
    <main className="auth-check-status">
      {status === 'loading' ? (
        <p role="status">ログイン状態を確認しています…</p>
      ) : (
        <div role="alert">
          {/* 未ログインとは区別し、サーバー障害や通信エラーであることを伝える。 */}
          <p>로그인 상태를 확인하지 못했습니다. 네트워크 연결을 확인한 뒤 다시 시도해주세요.</p>
          <button type="button" onClick={onRetry}>
            再試行
          </button>
        </div>
      )}
    </main>
  );
}

export default AuthCheckStatus;
