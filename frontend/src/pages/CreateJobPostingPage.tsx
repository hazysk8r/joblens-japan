import { Link, useNavigate } from 'react-router';

import './CreateJobPostingPage.css';
import JobPostingCreateForm
  from '../components/JobPostingCreateForm';

function CreateJobPostingPage() {

  const navigate = useNavigate();

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
        />
      </section>
    </main>
  );
}

export default CreateJobPostingPage;