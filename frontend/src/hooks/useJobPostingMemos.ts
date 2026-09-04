import { useState } from 'react';

import {
  deleteJobPostingMemo,
  getJobPostingMemos,
  updateJobPostingMemo,
} from '../api/jobPostingMemoApi';

import type {
  JobPostingMemo,
  UpdateJobPostingMemoRequest,
} from '../types/jobPostingMemo';

export function useJobPostingMemos(jobPostingId: number) {
  const [memos, setMemos] = useState<JobPostingMemo[]>([]);
  const [memosError, setMemosError] = useState<string | null>(null);
  const [memosLoading, setMemosLoading] = useState(false);
  const [memosLoaded, setMemosLoaded] = useState(false);

  const [deletingMemoId, setDeletingMemoId] =
    useState<number | null>(null);

  const [editingMemoId, setEditingMemoId] =
    useState<number | null>(null);

  const [savingMemoId, setSavingMemoId] =
    useState<number | null>(null);

  const [memoUpdateError, setMemoUpdateError] =
    useState<string | null>(null);

  /**
   * Memo一覧を取得する。
   *
   * force=false:
   *   すでに取得済みならCacheを利用して再取得しない。
   *
   * force=true:
   *   Mutation後などServerの状態が変わった可能性があるため、
   *   Cacheを無視して最新一覧を再取得する。
   */
  async function loadMemos(force = false) {
    if (memosLoaded && !force) {
      return;
    }

    setMemosLoading(true);
    setMemosError(null);

    try {
      const loadedMemos =
        await getJobPostingMemos(jobPostingId);

      setMemos(loadedMemos);
      setMemosLoaded(true); // 空配列でも正常取得なら「取得済み」として扱う
    } catch (error) {
      // 失敗した結果をCacheとして誤って再利用しない
      setMemos([]);
      setMemosLoaded(false);

      setMemosError(
        error instanceof Error
          ? error.message
          : '메모 조회에 실패하였습니다.',
      );
    } finally {
      setMemosLoading(false);
    }
  }

  /**
   * Memo作成API自体はCreate Form側が担当する。
   * 作成成功後はServer側のMemoが変わっているため、
   * 既存Cacheを無効化して最新一覧を再取得する。
   */
  async function handleMemoCreated() {
    setMemosLoaded(false);

    await loadMemos(true);
  }

  /**
   * Memo編集開始時に対象IDを保持し、
   * 前回の更新Errorが残らないように初期化する。
   */
  function startMemoEdit(memoId: number) {
    setEditingMemoId(memoId);
    setMemoUpdateError(null);
  }

  function cancelMemoEdit() {
    setEditingMemoId(null);
    setMemoUpdateError(null);
  }

  /**
   * 成功:
   *   Edit Formを閉じてServerから最新一覧を再取得する。
   * 失敗:
   *   editingMemoIdは維持し、Edit Formを閉じない。
   */
  async function saveMemoEdit(
    memoId: number,
    request: UpdateJobPostingMemoRequest,
  ) {
    setSavingMemoId(memoId);
    setMemoUpdateError(null);

    try {
      await updateJobPostingMemo(
        jobPostingId,
        memoId,
        request,
      );

      setEditingMemoId(null);

      // Server側のMemo内容・updatedAtが変更されたため
      // 現在のCacheを無効化する
      setMemosLoaded(false);

      await loadMemos(true);
    } catch (error) {
      setMemoUpdateError(
        error instanceof Error
          ? error.message
          : '수정 중 알 수 없는 오류가 발생하였습니다.',
      );
    } finally {
      setSavingMemoId(null);
    }
  }

  /**
   * 削除確認そのものはView側の責任とし、
   * このHookはServerへのDELETEと状態更新だけを担当する。
   */
  async function deleteMemo(memoId: number) {
    setDeletingMemoId(memoId);
    setMemosError(null);

    try {
      await deleteJobPostingMemo(
        jobPostingId,
        memoId,
      );

      // Server側からMemoが消えているため
      // 現在の一覧Cacheをそのまま使わない
      setMemosLoaded(false);

      await loadMemos(true);
    } catch (error) {
      setMemosError(
        error instanceof Error
          ? error.message
          : '삭제 중 알 수 없는 오류가 발생하였습니다.',
      );
    } finally {
      setDeletingMemoId(null);
    }
  }

  /**
   * Componentには表示に必要なStateと、
   * ユーザー操作に対応する関数だけ公開する。
   *
   * setMemosLoadedなどの内部setterは公開せず、
   * Cache管理の詳細をComponentから隠す。
   */
  return {
    memos,
    memosError,
    memosLoading,

    deletingMemoId,
    editingMemoId,
    savingMemoId,
    memoUpdateError,

    loadMemos,
    handleMemoCreated,
    startMemoEdit,
    cancelMemoEdit,
    saveMemoEdit,
    deleteMemo,
  };
}