import { useEffect, useRef, useState } from 'react';

import {
  deleteJobPostingMemo,
  getJobPostingMemos,
  updateJobPostingMemo,
} from '../api/jobPostingMemoApi';
import {
  ApiError,
  errorMessageOf,
  isJobPostingMemoVersionConflict,
  userMessageOf,
} from '../api/apiError';
import { useRefreshableResource } from './useRefreshableResource';

import type { JobPostingMemo, UpdateJobPostingMemoRequest } from '../types/jobPostingMemo';

export const MEMO_CONFLICT_MESSAGE =
  'このメモは別の画面で更新されました。入力内容を控えてから、最新の内容を読み込んでください。';
const MEMO_DELETED_MESSAGE = 'このメモは別の画面で削除されました。';

/**
 * 編集中のメモ。
 *
 * baseVersionとinitialContentは、編集を始めたとき(または最新の内容を読み込んだとき)の値で、
 * 裏で一覧を取り直しても変えない。取り直した新しいバージョンで保存すると、
 * 別の画面で保存された変更を黙って上書きしてしまうため。
 */
export type MemoEditSession = {
  memoId: number;
  baseVersion: number;
  initialContent: string;
  // フォームを作り直すためのキー。最新の内容を読み込んだら変え、入力を最新の内容に入れ替える。
  formKey: number;
  // 最新の内容を読み込んで作り直したフォーム。入力欄にフォーカスを移す。
  reloaded: boolean;
  // 別の画面で先に保存されていて、保存できなかった。
  conflict: boolean;
  reloading: boolean;
};

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

  const [editSession, setEditSession] =
    useState<MemoEditSession | null>(null);
  const editingMemoId = editSession?.memoId ?? null;
  const nextFormKeyRef = useRef(0);
  // 最新の内容の読み込み。編集をやめたり、画面を離れたりしたら取り消す。
  const reloadControllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => reloadControllerRef.current?.abort(), []);

  function abortReload() {
    reloadControllerRef.current?.abort();
    reloadControllerRef.current = null;
  }

  // 保存や読み込みの完了が、その後に始めた別のメモの編集を変えないよう、同じメモのときだけ変える。
  function updateSession(memoId: number, update: (session: MemoEditSession) => MemoEditSession | null) {
    setEditSession((current) => (current !== null && current.memoId === memoId ? update(current) : current));
  }

  function sessionOf(memo: Pick<JobPostingMemo, 'id' | 'version' | 'content'>, reloaded: boolean): MemoEditSession {
    nextFormKeyRef.current += 1;
    return {
      memoId: memo.id,
      baseVersion: memo.version,
      initialContent: memo.content,
      formKey: nextFormKeyRef.current,
      reloaded,
      conflict: false,
      reloading: false,
    };
  }

  const [savingMemoId, setSavingMemoId] =
    useState<number | null>(null);

  const [memoUpdateError, setMemoUpdateError] =
    useState<string | null>(null);

  /**
   * Memo編集開始時に対象IDを保持し、
   * 前回の更新Errorが残らないように初期化する。
   */
  function startMemoEdit(memo: JobPostingMemo) {
    abortReload();
    setEditSession(sessionOf(memo, false));
    setMemoUpdateError(null);
    setMemoMutationError(null);
  }

  function cancelMemoEdit() {
    abortReload();
    setEditSession(null);
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
    if (editSession === null || editSession.memoId !== memoId) {
      return;
    }
    const { baseVersion } = editSession;
    setSavingMemoId(memoId);
    setMemoUpdateError(null);
    setMemoMutationError(null);

    try {
      await updateJobPostingMemo(
        jobPostingId,
        memoId,
        baseVersion,
        request,
      );

      await refreshMemos();

      // 保存開始後に別のMemoが編集された場合、その編集状態を古いResponseで解除しない
      updateSession(memoId, () => null);
    } catch (error) {
      if (isMemoAlreadyDeleted(error)) {
        // メモごとフォームが消えるため、フォームの外の領域に案内する。
        updateSession(memoId, () => null);
        setMemoMutationError(MEMO_DELETED_MESSAGE);
        await refreshMemos();
        return;
      }

      if (isJobPostingMemoVersionConflict(error)) {
        // 自動では送り直さない。入力は残し、取り直した最新の内容と見比べてもらう。
        updateSession(memoId, (session) => ({ ...session, conflict: true }));
        setMemoUpdateError(MEMO_CONFLICT_MESSAGE);
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
   * 競合の後に、入力を捨てて最新の内容とバージョンで編集をやり直す。
   * 一覧の取り直しは結果を返さないため、ここで直接取得する。
   */
  async function reloadMemoEdit(memoId: number) {
    if (editSession === null || editSession.memoId !== memoId || editSession.reloading) {
      return;
    }
    abortReload();
    const controller = new AbortController();
    reloadControllerRef.current = controller;
    updateSession(memoId, (session) => ({ ...session, reloading: true }));

    try {
      const memos = await getJobPostingMemos(jobPostingId, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      const latest = memos.find((memo) => memo.id === memoId);
      setMemoUpdateError(null);
      if (latest === undefined) {
        updateSession(memoId, () => null);
        setMemoMutationError(MEMO_DELETED_MESSAGE);
        await refreshMemos();
        return;
      }
      updateSession(memoId, () => sessionOf(latest, true));
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      updateSession(memoId, (session) => ({ ...session, reloading: false }));
      setMemoUpdateError(userMessageOf(error, '最新の内容を読み込めませんでした。'));
    } finally {
      if (reloadControllerRef.current === controller) {
        reloadControllerRef.current = null;
      }
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
    editSession,
    savingMemoId,
    memoUpdateError,

    startMemoEdit,
    cancelMemoEdit,
    saveMemoEdit,
    reloadMemoEdit,
    deleteMemo,
  };
}
