import { useState } from 'react';

import type { ApplicationStatus, JobPosting } from '../types/jobPosting';
import {
  APPLICATION_STATUSES,
  APPLICATION_STATUS_LABELS,
} from '../utils/jobPostingFormat';

interface ApplicationStatusControlProps {
  id: string;
  jobPosting: JobPosting;
  updating: boolean;
  onSubmit: (status: ApplicationStatus) => void;
}

/**
 * 応募ステータスの選択欄と変更ボタン。
 *
 * 矢印キーなどで選択が動いただけでは保存しない。変更履歴が残る操作のため、ボタンで確定する。
 * 選択はどのversionに対するものかと一緒に持ち、求人が更新されたら捨ててサーバーの値を表示する。
 */
function ApplicationStatusControl({
  id,
  jobPosting,
  updating,
  onSubmit,
}: ApplicationStatusControlProps) {
  const [draft, setDraft] = useState<{
    baseVersion: number;
    status: ApplicationStatus;
  } | null>(null);

  const selected = draft !== null && draft.baseVersion === jobPosting.version
    ? draft.status
    : jobPosting.applicationStatus;
  const blocked = updating || selected === jobPosting.applicationStatus;

  return (
    <div className="detail-posting__status-control">
      <select
        id={id}
        className="detail-posting__status-select"
        value={selected}
        disabled={updating}
        onChange={(event) => {
          setDraft({
            baseVersion: jobPosting.version,
            status: event.target.value as ApplicationStatus,
          });
        }}
      >
        {APPLICATION_STATUSES.map((status) => (
          <option key={status} value={status}>
            {APPLICATION_STATUS_LABELS[status]}
          </option>
        ))}
      </select>

      {/* disabledにすると、押した直後にキーボードのフォーカスがページの先頭へ外れるため使わない。 */}
      <button
        type="button"
        className="detail-posting__status-button"
        aria-disabled={blocked}
        onClick={() => {
          if (!blocked) {
            onSubmit(selected);
          }
        }}
      >
        変更
      </button>

      {updating && <span className="detail-posting__status-updating">ステータス変更中…</span>}
    </div>
  );
}

export default ApplicationStatusControl;
