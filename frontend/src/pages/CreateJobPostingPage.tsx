import { Link, useNavigate } from 'react-router';

import './CreateJobPostingPage.css';
import { useAuth } from '../auth/useAuth';
import JobPostingCreateForm
  from '../components/JobPostingCreateForm';
import { postingDraftKey } from '../utils/postingDraftStorage';

function CreateJobPostingPage() {

  const navigate = useNavigate();
  const { state: authState } = useAuth();
  // この画面はログイン中だけ表示されるため、0になることはない。
  const userId = authState.status === 'authenticated' ? authState.user.id : 0;

  const handleJobPostingCreated = () => {
    navigate('/');
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