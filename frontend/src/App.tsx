import { Routes, Route } from 'react-router'

import HomePage from './pages/HomePage';
import CreateJobPostingPage from './pages/CreateJobPostingPage';
import NotFoundPage from './pages/NotFoundPage';



function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/job-postings/new"
        element={<CreateJobPostingPage />}
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;