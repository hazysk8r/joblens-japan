import { Link, useNavigate } from 'react-router';

import './CreateJobPostingPage.css';
import { useAuth } from '../auth/useAuth';
import JobPostingCreateForm
  from '../components/JobPostingCreateForm';
import type { JobPosting } from '../types/jobPosting';
import { postingDraftKey } from '../utils/postingDraftStorage';

function CreateJobPostingPage() {

  const navigate = useNavigate();
  const { state: authState } = useAuth();
  // この画面はログイン中だけ表示されるため、0になることはない。
  const userId = authState.status === 'authenticated' ? authState.user.id : 0;

  // 登録した求人の分析をすぐ見られるよう、詳細画面へ移る。
  // 戻る操作で空になった登録画面に戻らないよう、履歴を置き換える(戻ると元の画面へ)。
  const handleJobPostingCreated = (jobPosting: JobPosting) => {
    navigate(`/job-postings/${jobPosting.id}`, { replace: true, state: { notice: 'created' } });
  };

  return (
    <main className="create-page">
      <header className="create-page-header">
        <h1>JobLens Japan</h1>

        <Link
          to="/"
          className="back-to-home-link"
        >
          ← 求人一覧に戻る
        </Link>
      </header>

      <section className="create-page-content">
        <JobPostingCreateForm
          onCreated={handleJobPostingCreated}
          draftKey={postingDraftKey(userId)}
        />
      </section>
    </main>
  );
}

export default CreateJobPostingPage;