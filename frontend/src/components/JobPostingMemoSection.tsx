import { useAuth } from '../auth/useAuth';
import { useJobPostingMemos } from '../hooks/useJobPostingMemos';
import type { JobPostingMemo } from '../types/jobPostingMemo';
import { formatDateTime } from '../utils/date';
import { memoDraftKey } from '../utils/memoDraftStorage';
import JobPostingMemoCreateForm from './JobPostingMemoCreateForm';
import JobPostingMemoEditForm from './JobPostingMemoEditForm';

/** 詳細画面のメモの領域。取得に失敗しても登録はできるよう、登録フォームは常に表示する。 */
function JobPostingMemoSection({ jobPostingId }: { jobPostingId: number }) {
  const { state: authState } = useAuth();
  // この領域はログイン中だけ表示されるため、0になることはない。
  const userId = authState.status === 'authenticated' ? authState.user.id : 0;
  const {
    memosState,
    retryMemos,
    refreshMemos,
    memoMutationError,
    deletingMemoId,
    editingMemoId,
    savingMemoId,
    memoUpdateError,
    startMemoEdit,
    cancelMemoEdit,
    saveMemoEdit,
    deleteMemo,
  } = useJobPostingMemos(jobPostingId);

  // 削除確認はUIの責任なのでComponent側で行う。実際のDELETE処理はHookへ委譲する。
  async function handleMemoDeletion(memoId: number) {
    if (window.confirm('メモを削除しますか？')) {
      await deleteMemo(memoId);
    }
  }

  function renderMemo(memo: JobPostingMemo) {
    if (editingMemoId === memo.id) {
      return (
        <>
          <JobPostingMemoEditForm
            jobPostingMemo={memo}
            saving={savingMemoId === memo.id}
            onSave={(request) => saveMemoEdit(memo.id, request)}
            onCancel={cancelMemoEdit}
          />
          {memoUpdateError !== null && <p role="alert">{memoUpdateError}</p>}
        </>
      );
    }

    const deleting = deletingMemoId === memo.id;

    return (
      <>
        <span>{memo.content}</span>
        <p>更新日時: {formatDateTime(memo.updatedAt)}</p>
        <button type="button" onClick={() => startMemoEdit(memo.id)} disabled={deleting}>
          編集
        </button>
        <button
          type="button"
          onClick={() => {
            void handleMemoDeletion(memo.id);
          }}
          disabled={deleting}
        >
          {deleting ? 'メモを削除中…' : 'メモを削除'}
        </button>
      </>
    );
  }

  function renderMemos() {
    switch (memosState.status) {
      case 'loading':
        return <p>メモを読み込み中…</p>;

      case 'error':
        return (
          <>
            <p role="alert">{memosState.message}</p>
            <button type="button" onClick={retryMemos}>メモを再試行</button>
          </>
        );

      case 'loaded':
        return (
          <>
            {memosState.refreshError !== null && (
              <>
                <p role="alert">{memosState.refreshError}</p>
                <button
                  type="button"
                  onClick={() => {
                    void refreshMemos();
                  }}
                >
                  メモを再読み込み
                </button>
              </>
            )}

            {memoMutationError !== null && <p role="alert">{memoMutationError}</p>}

            {memosState.data.length > 0 ? (
              <ul className="detail-memos__list">
                {memosState.data.map((memo) => (
                  <li key={memo.id}>{renderMemo(memo)}</li>
                ))}
              </ul>
            ) : (
              <p>登録されたメモはありません。</p>
            )}
          </>
        );

      default: {
        // 状態を追加して、ここでの表示を書き忘れた場合に型エラーになる。
        const unhandled: never = memosState;
        return unhandled;
      }
    }
  }

  return (
    <section className="detail-activity" aria-labelledby="detail-memo-heading">
      <h3 id="detail-memo-heading" tabIndex={-1}>メモ</h3>
      <JobPostingMemoCreateForm
        jobPostingId={jobPostingId}
        draftKey={memoDraftKey(userId, jobPostingId)}
        onCreated={refreshMemos}
      />
      <div className="detail-memos">{renderMemos()}</div>
    </section>
  );
}

export default JobPostingMemoSection;
