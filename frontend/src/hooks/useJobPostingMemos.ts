import { useState } from 'react';

import {
  deleteJobPostingMemo,
  getJobPostingMemos,
  updateJobPostingMemo,
} from '../api/jobPostingMemoApi';
import { ApiError, errorMessageOf, userMessageOf } from '../api/apiError';
import { useRefreshableResource } from './useRefreshableResource';

import type { UpdateJobPostingMemoRequest } from '../types/jobPostingMemo';

// 別の画面で削除されたメモへの操作かを判定する。求人自体がない場合(JOB_POSTING_NOT_FOUND)は含めない。
function isMemoAlreadyDeleted(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'JOB_POSTING_MEMO_NOT_FOUND';
}

/**
 * 詳細画面のメモの取得と、編集・削除の状態を管理する。
 *
 * 変更の後は裏で一覧を取り直す。別のメモを編集している途中の入力を失わないため。
 */
export function useJobPostingMemos(jobPostingId: number) {
  const {
    state: memosState,
    retry: retryMemos,
    refresh: refreshMemos,
  } = useRefreshableResource(
    jobPostingId,
    getJobPostingMemos,
    'メモの取得に失敗しました。',
  );

  // 削除に失敗しても取得済みの一覧は残すため、取得のエラーとは分けて持つ。
  const [memoMutationError, setMemoMutationError] = useState<string | null>(null);

  const [deletingMemoId, setDeletingMemoId] =
    useState<number | null>(null);

  const [editingMemoId, setEditingMemoId] =
    useState<number | null>(null);

  const [savingMemoId, setSavingMemoId] =
    useState<number | null>(null);

  const [memoUpdateError, setMemoUpdateError] =
    useState<string | null>(null);

  /**
   * Memo編集開始時に対象IDを保持し、
   * 前回の更新Errorが残らないように初期化する。
   */
  function startMemoEdit(memoId: number) {
    setEditingMemoId(memoId);
    setMemoUpdateError(null);
    setMemoMutationError(null);
  }

  function cancelMemoEdit() {
    setEditingMemoId(null);
    setMemoUpdateError(null);
  }

  /**
   * 成功:
   *   最新の一覧を受け取ってからEdit Formを閉じる。先に閉じると古い内容が一瞬見えるため。
   * 失敗:
   *   editingMemoIdは維持し、Edit Formを閉じない。
   */
  async function saveMemoEdit(
    memoId: number,
    request: UpdateJobPostingMemoRequest,
  ) {
    setSavingMemoId(memoId);
    setMemoUpdateError(null);
    setMemoMutationError(null);

    try {
      await updateJobPostingMemo(
        jobPostingId,
        memoId,
        request,
      );

      await refreshMemos();

      // 保存開始後に別のMemoが編集された場合、その編集状態を古いResponseで解除しない
      setEditingMemoId((currentEditingMemoId) =>
        currentEditingMemoId === memoId
          ? null
          : currentEditingMemoId,
      );
    } catch (error) {
      if (isMemoAlreadyDeleted(error)) {
        // メモごとフォームが消えるため、フォームの外の領域に案内する。
        setEditingMemoId((currentEditingMemoId) =>
          currentEditingMemoId === memoId
            ? null
            : currentEditingMemoId,
        );
        setMemoMutationError('このメモは別の画面で削除されました。');
        await refreshMemos();
        return;
      }

      setMemoUpdateError(errorMessageOf(
        error,
        'content',
        '編集中に不明なエラーが発生しました。',
      ));
    } finally {
      // 別のMemoが保存中の場合、その保存状態を解除しない。
      setSavingMemoId((currentSavingMemoId) =>
        currentSavingMemoId === memoId
          ? null
          : currentSavingMemoId,
      );
    }
  }

  /**
   * 削除確認そのものはView側の責任とし、
   * このHookはServerへのDELETEと状態更新だけを担当する。
   */
  async function deleteMemo(memoId: number) {
    setDeletingMemoId(memoId);
    setMemoMutationError(null); // 再試行時に前回の削除エラーを残さない

    try {
      await deleteJobPostingMemo(
        jobPostingId,
        memoId,
      );

      await refreshMemos();
    } catch (error) {
      if (isMemoAlreadyDeleted(error)) {
        // すでに望んだ結果になっているため、エラーにせず一覧だけを最新にする。
        await refreshMemos();
        return;
      }

      setMemoMutationError(
        userMessageOf(error, '削除中に不明なエラーが発生しました。'),
      );
    } finally {
      // 別のMemoが削除中の場合、その削除状態を解除しない。
      setDeletingMemoId((currentDeletingMemoId) =>
        currentDeletingMemoId === memoId
          ? null
          : currentDeletingMemoId,
      );
    }
  }

  return {
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
  };
}
