import { useNavigate } from 'react-router';

import JobPostingCreateForm
  from '../components/JobPostingCreateForm';

function CreateJobPostingPage() {

  const navigate = useNavigate();

  const handleJobPostingCreated = () => {
    navigate('/');
  };

  return (
    <main>
      <h1>求人登録</h1>

      <JobPostingCreateForm
        onCreated={handleJobPostingCreated}
      />
    </main>
  );
}

export default CreateJobPostingPage;