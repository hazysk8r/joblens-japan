import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import './JobPostingDetailPage.css';
import { ApiError, userMessageOf } from '../api/apiError';
import { deleteJobPosting } from '../api/jobPostingApi';
import { useAuth } from '../auth/useAuth';
import ApplicationStatusControl from '../components/ApplicationStatusControl';
import JobPostingEditForm from '../components/JobPostingEditForm';
import JobPostingAnalysisPanel from '../components/JobPostingAnalysisPanel';
import JobPostingMemoSection from '../components/JobPostingMemoSection';
import JobPostingStatusHistorySection from '../components/JobPostingStatusHistorySection';
import { useJobPostingAnalysis } from '../hooks/useJobPostingAnalysis';
import { useJobPostingDetail } from '../hooks/useJobPostingDetail';
import { useJobPostingEdit } from '../hooks/useJobPostingEdit';
import { useJobPostingStatusChange } from '../hooks/useJobPostingStatusChange';
import { useJobPostingStatusHistory } from '../hooks/useJobPostingStatusHistory';
import type {
  AnalysisEvidence,
  JobPosting,
  JobPostingAnalysis,
  UpdateJobPostingRequest,
} from '../types/jobPosting';
import { formatDateTime } from '../utils/date';
import {
  locateEvidence,
  placeSelectedEvidence,
  segmentsOf,
  type EvidenceRange,
} from '../utils/evidenceHighlight';
import { removeDraft } from '../utils/draftStorage';
import { isHttpUrl } from '../utils/httpUrl';
import { formatSalaryRange } from '../utils/jobPostingFormat';
import { listPathFromState } from '../utils/listReturn';
import { memoDraftKey } from '../utils/memoDraftStorage';
import { NAVIGATION_NOTICE_TEXT, navigationNoticeOf, withoutNotice } from '../utils/navigationNotice';
import {
  postingEditDraftKey,
  postingValuesOf,
  readPostingEditDraft,
  samePostingValues,
  writePostingEditDraft,
  type PostingDraft,
  type PostingEditDraft,
} from '../utils/postingDraftStorage';
import PageTitle from '../components/PageTitle';

// 成功の案内を表示しておく時間。他の案内と同じ。
const NOTICE_DURATION_MS = 3000;

type EditSession = {
  // 最新の内容で編集をやり直すときに、フォームを作り直すための番号。
  key: number;
  baseVersion: number;
  initialValues: PostingDraft;
};

// URLのIDとして受け付ける形。先頭の0や符号、小数、指数表記は受け付けない。
const ID_PATTERN = /^[1-9]\d*$/;

function parseJobPostingId(value: string | undefined): number | null {
  if (value === undefined || !ID_PATTERN.test(value)) {
    return null;
  }
  const id = Number(value);
  // JavaScriptの数値で正確に表せない大きなIDは、丸められた別のIDをAPIに送ってしまうため受け付けない。
  return Number.isSafeInteger(id) ? id : null;
}

// 詳細画面の共通部分。どの状態でも一覧へ戻れるようにする。
function DetailLayout({ children }: { children: ReactNode }) {
  const location = useLocation();

  return (
    <main className="detail-page">
      <header className="detail-page-header">
        <h1>JobLens Japan</h1>

        <Link
          to={listPathFromState(location.state)}
          className="back-to-home-link"
        >
          ← 求人一覧に戻る
        </Link>
      </header>

      <div className="detail-page-content">
        {children}
      </div>
    </main>
  );
}

function NotFound() {
  return (
    <section className="detail-page-message">
      <PageTitle name="求人が見つかりません" />
      <h2>求人が見つかりません</h2>
      <p>削除されたか、URLが間違っている可能性があります。</p>
    </section>
  );
}

// 分析は求人を取得できてから要求する。失敗しても、求人の情報と原文の表示には影響させない。
function JobPostingAnalysisBody({
  analysis,
  evidenceRanges,
  onShowEvidence,
  canShowSkillEvidence,
  onShowSkillEvidence,
}: {
  analysis: ReturnType<typeof useJobPostingAnalysis>;
  evidenceRanges: (EvidenceRange | null)[];
  onShowEvidence: (index: number) => void;
  canShowSkillEvidence: (evidence: AnalysisEvidence) => boolean;
  onShowSkillEvidence: (label: string, evidence: AnalysisEvidence) => void;
}) {
  const { state, retry } = analysis;

  switch (state.status) {
    case 'loading':
      return <p>分析中…</p>;

    case 'error':
      return (
        <>
          <p role="alert">{state.message}</p>
          <button type="button" onClick={retry}>分析を再試行</button>
        </>
      );

    case 'loaded':
      return (
        <JobPostingAnalysisPanel
          analysis={state.analysis}
          showableEvidence={evidenceRanges.map((range) => range !== null)}
          onShowEvidence={onShowEvidence}
          canShowSkillEvidence={canShowSkillEvidence}
          onShowSkillEvidence={onShowSkillEvidence}
        />
      );

    default: {
      // 状態を追加して、ここでの表示を書き忘れた場合に型エラーになる。
      const unhandled: never = state;
      return unhandled;
    }
  }
}

/**
 * 求人票の原文。固定残業代の根拠の行を強調し、選んだ技術の根拠の行も強調する。
 * 原文の中には文字を足さない。複製したときに元の原文と同じになるようにするため。
 * 強調した行が判定の根拠であることは、画面に出さない説明(aria-describedby)で読み上げる。
 *
 * evidenceRangesの前からfixedOvertimeCount個は固定残業代の根拠、その後ろは選んだ技術の根拠。
 */
function OriginalText({
  text,
  evidenceRanges,
  fixedOvertimeCount,
  currentEvidence,
  selectedSkillLabel,
  markIdOf,
}: {
  text: string;
  evidenceRanges: (EvidenceRange | null)[];
  fixedOvertimeCount: number;
  currentEvidence: number | null;
  selectedSkillLabel: string | null;
  markIdOf: (index: number) => string;
}) {
  const fixedOvertimeDescriptionId = useId();
  const skillDescriptionId = useId();
  const bothDescriptionId = useId();
  const count = evidenceRanges.slice(0, fixedOvertimeCount).filter((range) => range !== null).length;

  function descriptionIdOf(index: number): string {
    if (index >= fixedOvertimeCount) {
      return skillDescriptionId;
    }
    // 技術の根拠が固定残業代の根拠と同じ行なら、両方の判定の根拠として読み上げる。
    return index === currentEvidence && selectedSkillLabel !== null ? bothDescriptionId : fixedOvertimeDescriptionId;
  }

  return (
    <>
      {count > 0 && (
        <p className="detail-posting__evidence-notice">
          {`色付きの行は固定残業代の判定の根拠です（${count}か所）。`}
        </p>
      )}
      {selectedSkillLabel !== null && (
        <p className="detail-posting__evidence-notice">
          {`選択中の行は「${selectedSkillLabel}」の判定の根拠です。`}
        </p>
      )}
      <p className="detail-posting__original-text">
        {segmentsOf(text, evidenceRanges).map((segment) => (
          segment.evidenceIndex === null ? segment.text : (
            <mark
              key={segment.evidenceIndex}
              id={markIdOf(segment.evidenceIndex)}
              // 「原文で見る」からフォーカスを移せるようにする。Tabの順番には入れない。
              tabIndex={-1}
              aria-describedby={descriptionIdOf(segment.evidenceIndex)}
              className={segment.evidenceIndex === currentEvidence
                ? 'detail-posting__evidence detail-posting__evidence--current'
                : 'detail-posting__evidence'}
            >
              {segment.text}
            </mark>
          )
        ))}
      </p>
      <span id={fixedOvertimeDescriptionId} hidden>固定残業代の判定の根拠</span>
      {selectedSkillLabel !== null && (
        <>
          <span id={skillDescriptionId} hidden>{`「${selectedSkillLabel}」の判定の根拠`}</span>
          <span id={bothDescriptionId} hidden>{`固定残業代と「${selectedSkillLabel}」の判定の根拠`}</span>
        </>
      )}
    </>
  );
}

// 「原文で見る」で見ている根拠。labelは画面に出す技術の名前(「Java・Pythonのいずれか」など)。
type ShownEvidence =
  | { analysis: JobPostingAnalysis; kind: 'fixedOvertime'; index: number }
  | { analysis: JobPostingAnalysis; kind: 'skill'; label: string; evidence: AnalysisEvidence };

const PAGE_SECTIONS = [
  { headingId: 'detail-analysis-heading', label: '分析' },
  { headingId: 'detail-original-heading', label: '原文' },
  { headingId: 'detail-memo-heading', label: 'メモ' },
  { headingId: 'detail-history-heading', label: '変更履歴' },
];

// URLのハッシュで移動すると履歴のstateが失われ、検索条件の付いた一覧へ戻れなくなるため、ボタンで移動する。
function PageSectionNav() {
  function moveTo(headingId: string) {
    const heading = document.getElementById(headingId);
    heading?.scrollIntoView();
    heading?.focus({ preventScroll: true });
  }

  return (
    <nav className="detail-posting__section-nav" aria-label="ページ内の移動">
      {PAGE_SECTIONS.map(({ headingId, label }) => (
        <button key={headingId} type="button" onClick={() => moveTo(headingId)}>
          {label}
        </button>
      ))}
    </nav>
  );
}

/**
 * 求人の詳細。編集と削除もここで行う。
 *
 * 編集中は基本情報・分析・原文を隠してフォームを表示する。隠すだけで画面からは外さないため、
 * 原文を変えずに保存しても分析を取り直さない。応募ステータスの変更も隠す。
 * 同じ画面で変更するとversionが上がり、自分の編集の保存が競合してしまうため。
 */
function JobPostingDetail({
  jobPosting,
  onJobPostingChange,
}: {
  jobPosting: JobPosting;
  onJobPostingChange: (jobPosting: JobPosting) => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state: authState } = useAuth();
  // この画面はログイン中だけ表示されるため、0になることはない。
  const userId = authState.status === 'authenticated' ? authState.user.id : 0;
  const editDraftKey = postingEditDraftKey(userId, jobPosting.id);

  const statusHistory = useJobPostingStatusHistory(jobPosting.id);

  // 分析は分析の欄と原文の両方で使うため、ここで取得する。
  const analysis = useJobPostingAnalysis(jobPosting);
  const loadedAnalysis = analysis.state.status === 'loaded' ? analysis.state.analysis : null;
  const evidenceRanges = locateEvidence(jobPosting.originalText, loadedAnalysis?.fixedOvertime.evidence ?? []);
  // 「原文で見る」で見ている根拠。分析を取り直したら位置が変わり得るため、どの分析の根拠かも持つ。
  // 見ている根拠は、固定残業代と技術を合わせて1つだけにする。
  const [shownEvidence, setShownEvidence] = useState<ShownEvidence | null>(null);
  const shown = shownEvidence !== null && shownEvidence.analysis === loadedAnalysis ? shownEvidence : null;
  const skillPlacement = shown?.kind === 'skill'
    ? placeSelectedEvidence(jobPosting.originalText, evidenceRanges, shown.evidence)
    : null;
  const selectedSkillLabel = shown?.kind === 'skill' && skillPlacement !== null ? shown.label : null;
  // 技術の根拠は、選んだときだけ固定残業代の根拠の後ろに足して強調する。
  const highlightRanges = skillPlacement?.kind === 'added'
    ? [...evidenceRanges, skillPlacement.range]
    : evidenceRanges;
  const skillMarkIndex = skillPlacement === null
    ? null
    : skillPlacement.kind === 'existing' ? skillPlacement.index : evidenceRanges.length;
  const currentEvidence = shown?.kind === 'fixedOvertime' ? shown.index : skillMarkIndex;
  const evidenceIdPrefix = useId();
  const markIdOf = (index: number) => `${evidenceIdPrefix}-evidence-${index}`;

  // 強調する行を描画してから、その行を画面の中央に出してフォーカスする。
  function moveToEvidence(next: ShownEvidence, markIndex: number) {
    flushSync(() => setShownEvidence(next));
    const mark = document.getElementById(markIdOf(markIndex));
    // 上に固定した移動バーに隠れないよう、画面の中央に出す。
    mark?.scrollIntoView({ block: 'center' });
    mark?.focus({ preventScroll: true });
  }

  function showEvidence(index: number) {
    if (loadedAnalysis === null) {
      return;
    }
    moveToEvidence({ analysis: loadedAnalysis, kind: 'fixedOvertime', index }, index);
  }

  function canShowSkillEvidence(evidence: AnalysisEvidence) {
    return placeSelectedEvidence(jobPosting.originalText, evidenceRanges, evidence) !== null;
  }

  function showSkillEvidence(label: string, evidence: AnalysisEvidence) {
    const placement = placeSelectedEvidence(jobPosting.originalText, evidenceRanges, evidence);
    if (loadedAnalysis === null || placement === null) {
      return;
    }
    moveToEvidence(
      { analysis: loadedAnalysis, kind: 'skill', label, evidence },
      placement.kind === 'existing' ? placement.index : evidenceRanges.length,
    );
  }
  const { updating, error: statusError, notice: statusNotice, changeStatus } = useJobPostingStatusChange({
    jobPosting,
    onChanged: (changed) => {
      onJobPostingChange(changed);
      void statusHistory.refresh();
    },
  });

  const edit = useJobPostingEdit(jobPosting.id);
  const [session, setSession] = useState<EditSession | null>(null);
  // セッション切れなどで保存できなかった編集。開いたときに知らせ、再開できるようにする。
  const [pendingDraft, setPendingDraft] = useState<PostingEditDraft | null>(
    () => readPostingEditDraft(editDraftKey),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const nextSessionKeyRef = useRef(0);
  // 編集を終えたら、表示し直された編集ボタンへフォーカスを戻す(押したボタンはフォームと一緒に消えるため)。
  const focusEditButtonRef = useRef(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // 登録した直後に来たら知らせる。押した「登録」は画面と一緒に消えるため、フォーカスはタイトルへ移す。
  useEffect(() => {
    if (navigationNoticeOf(location.state, 'created') === null) {
      return;
    }
    titleRef.current?.focus();
    // 読み上げソフトには、領域と文言が同時に現れると読まないものがあるため、領域を表示した後に文言を入れる。
    setTimeout(() => setNotice(NAVIGATION_NOTICE_TEXT.created), 0);
    // 新しく読み込んだり、戻る・進むで同じ履歴に来たりしたときに、もう一度知らせないよう取り除く。
    navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: withoutNotice(location.state) },
    );
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (notice === null) {
      return;
    }
    const timerId = setTimeout(() => setNotice(null), NOTICE_DURATION_MS);
    return () => clearTimeout(timerId);
  }, [notice]);

  const editing = session !== null;

  function openSession(baseVersion: number, initialValues: PostingDraft) {
    nextSessionKeyRef.current += 1;
    setSession({ key: nextSessionKeyRef.current, baseVersion, initialValues });
    setPendingDraft(null);
    setNotice(null);
    edit.reset();
  }

  function closeSession() {
    removeDraft(editDraftKey);
    setSession(null);
    focusEditButtonRef.current = true;
  }

  function handleStartEdit() {
    // ボタンを無効にしないため、削除中の操作はここで防ぐ。
    if (deleting) {
      return;
    }
    removeDraft(editDraftKey);
    openSession(jobPosting.version, postingValuesOf(jobPosting));
  }

  function handleChange(values: PostingDraft) {
    if (session === null) {
      return;
    }
    // 今の内容と同じなら、知らせる必要のある編集はない。
    if (samePostingValues(values, postingValuesOf(jobPosting))) {
      removeDraft(editDraftKey);
    } else {
      writePostingEditDraft(editDraftKey, { baseVersion: session.baseVersion, values });
    }
  }

  async function handleSave(_id: number, request: UpdateJobPostingRequest, expectedVersion: number) {
    const updated = await edit.save(request, expectedVersion);
    if (updated === null) {
      return;
    }
    onJobPostingChange(updated);
    closeSession();
    setNotice('求人を更新しました。');
  }

  function handleCancel(changed: boolean) {
    if (changed && !window.confirm('編集内容を破棄しますか？')) {
      return;
    }
    edit.reset();
    closeSession();
  }

  async function handleReloadLatest() {
    const latest = await edit.loadLatest();
    if (latest === null) {
      return;
    }
    onJobPostingChange(latest);
    removeDraft(editDraftKey);
    openSession(latest.version, postingValuesOf(latest));
  }

  function handleDiscardDraft() {
    removeDraft(editDraftKey);
    setPendingDraft(null);
    focusEditButtonRef.current = true;
  }

  async function handleDelete() {
    // ボタンを無効にしないため、削除中の二重送信はここで防ぐ。
    if (deleting || !window.confirm(`「${jobPosting.title}」を削除しますか？`)) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteJobPosting(jobPosting.id);
    } catch (caught) {
      // すでに削除されていれば、望んだ結果になっている。
      const alreadyDeleted = caught instanceof ApiError
        && caught.status === 404
        && caught.code === 'JOB_POSTING_NOT_FOUND';
      if (!alreadyDeleted) {
        setDeleteError(userMessageOf(caught, '削除中に不明なエラーが発生しました。'));
        setDeleting(false);
        return;
      }
    }

    removeDraft(memoDraftKey(userId, jobPosting.id));
    removeDraft(editDraftKey);
    // 戻る操作で削除した求人の画面に戻らないよう、履歴を置き換える。
    navigate(listPathFromState(location.state), { replace: true, state: { notice: 'deleted' } });
  }

  return (
    <article className="detail-posting">
      <header className="detail-posting__header">
        <h2 ref={titleRef} tabIndex={-1} className="detail-posting__title">{jobPosting.title}</h2>
        <p className="detail-posting__company">
          {jobPosting.companyName ?? '会社名未登録'}
        </p>

        {!editing && (
          <div className="detail-posting__actions">
            {/* disabledにすると、押した直後にキーボードのフォーカスがページの先頭へ外れるため使わない。 */}
            <button
              type="button"
              ref={(button) => {
                if (button && focusEditButtonRef.current) {
                  focusEditButtonRef.current = false;
                  button.focus();
                }
              }}
              aria-disabled={deleting}
              onClick={handleStartEdit}
            >
              編集
            </button>
            <button
              type="button"
              className="detail-posting__delete"
              aria-disabled={deleting}
              onClick={() => {
                void handleDelete();
              }}
            >
              {deleting ? '削除中…' : '削除'}
            </button>
          </div>
        )}
      </header>

      {/* 内容が変わったときに読み上げられるよう、領域は空でも表示しておく。 */}
      <p role="status" className="detail-posting__notice">{notice}</p>

      {deleteError !== null && (
        <p role="alert" className="detail-posting__error">{deleteError}</p>
      )}

      {pendingDraft !== null && !editing && (
        <div className="detail-posting__draft">
          <p>保存していない編集内容があります。</p>
          <button
            type="button"
            onClick={() => openSession(pendingDraft.baseVersion, pendingDraft.values)}
          >
            編集を再開
          </button>
          <button type="button" onClick={handleDiscardDraft}>破棄</button>
        </div>
      )}

      {session !== null && (
        <section className="detail-edit" aria-label="求人の編集">
          {edit.error !== null && (
            <div className="detail-edit__error">
              <p role="alert">{edit.error}</p>
              {edit.conflict && (
                <button
                  type="button"
                  aria-disabled={edit.loadingLatest}
                  onClick={() => {
                    if (!edit.loadingLatest) {
                      void handleReloadLatest();
                    }
                  }}
                >
                  入力を破棄して最新の内容を読み込む
                </button>
              )}
            </div>
          )}

          <JobPostingEditForm
            key={session.key}
            jobPosting={jobPosting}
            saving={edit.saving}
            expectedVersion={session.baseVersion}
            fieldErrors={edit.fieldErrors}
            initialValues={session.initialValues}
            autoFocusFirstField
            onChange={handleChange}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </section>
      )}

      <div hidden={editing}>
        <dl className="detail-posting__facts">
          <div>
            <dt>給与</dt>
            <dd>{formatSalaryRange(jobPosting.salaryMin, jobPosting.salaryMax)}</dd>
          </div>
          <div>
            <dt>応募締切日</dt>
            <dd>{jobPosting.applicationDeadline ?? '未登録'}</dd>
          </div>
          <div>
            <dt><label htmlFor="detail-application-status">応募ステータス</label></dt>
            <dd>
              <ApplicationStatusControl
                id="detail-application-status"
                jobPosting={jobPosting}
                updating={updating}
                notice={statusNotice}
                onSubmit={(status) => {
                  void changeStatus(status);
                }}
              />
            </dd>
          </div>
          <div>
            <dt>登録日時</dt>
            <dd>{formatDateTime(jobPosting.createdAt)}</dd>
          </div>
        </dl>

        {statusError !== null && (
          <p role="alert" className="detail-posting__status-error">{statusError}</p>
        )}

        {jobPosting.sourceUrl && isHttpUrl(jobPosting.sourceUrl) && (
          <p className="detail-posting__source">
            <a href={jobPosting.sourceUrl} target="_blank" rel="noreferrer">
              原文を見る
            </a>
          </p>
        )}
      </div>

      {!editing && <PageSectionNav />}

      <div hidden={editing}>
        <section
          className="detail-posting__analysis"
          aria-labelledby="detail-analysis-heading"
        >
          <h3 id="detail-analysis-heading" tabIndex={-1}>求人票の分析</h3>
          <JobPostingAnalysisBody
            analysis={analysis}
            evidenceRanges={evidenceRanges}
            onShowEvidence={showEvidence}
            canShowSkillEvidence={canShowSkillEvidence}
            onShowSkillEvidence={showSkillEvidence}
          />
        </section>

        <section
          className="detail-posting__original"
          aria-labelledby="detail-original-heading"
        >
          <h3 id="detail-original-heading" tabIndex={-1}>求人票の原文</h3>
          <OriginalText
            text={jobPosting.originalText}
            evidenceRanges={highlightRanges}
            fixedOvertimeCount={evidenceRanges.length}
            currentEvidence={currentEvidence}
            selectedSkillLabel={selectedSkillLabel}
            markIdOf={markIdOf}
          />
        </section>
      </div>

      <JobPostingMemoSection jobPostingId={jobPosting.id} />

      <JobPostingStatusHistorySection
        state={statusHistory.state}
        onRetry={statusHistory.retry}
        onRefresh={() => {
          void statusHistory.refresh();
        }}
      />
    </article>
  );
}

function JobPostingDetailContent({ id }: { id: number }) {
  const { state, retry, replaceJobPosting } = useJobPostingDetail(id);

  // 求人のタイトルや会社名は載せない(PageTitleの説明を参照)。
  if (state.status !== 'notFound') {
    return (
      <>
        <PageTitle name="求人の詳細" />
        <JobPostingDetailState state={state} retry={retry} replaceJobPosting={replaceJobPosting} />
      </>
    );
  }
  return <NotFound />;
}

function JobPostingDetailState({
  state,
  retry,
  replaceJobPosting,
}: ReturnType<typeof useJobPostingDetail>) {
  switch (state.status) {
    case 'loading':
      return <p className="detail-page-message">読み込み中…</p>;

    case 'notFound':
      return <NotFound />;

    case 'error':
      return (
        <section className="detail-page-message">
          <p role="alert">{state.message}</p>
          <button type="button" onClick={retry}>再試行</button>
        </section>
      );

    case 'loaded':
      return (
        <JobPostingDetail
          jobPosting={state.jobPosting}
          onJobPostingChange={replaceJobPosting}
        />
      );

    default: {
      // 状態を追加して、ここでの表示を書き忘れた場合に型エラーになる。
      const unhandled: never = state;
      return unhandled;
    }
  }
}

/**
 * 求人の詳細画面(/job-postings/:id)。
 * 形の正しくないIDは、通信せずに見つからない求人として扱う。
 */
function JobPostingDetailPage() {
  const { id } = useParams();
  const jobPostingId = parseJobPostingId(id);

  return (
    <DetailLayout>
      {jobPostingId === null
        ? <NotFound />
        : <JobPostingDetailContent id={jobPostingId} />}
    </DetailLayout>
  );
}

export default JobPostingDetailPage;
