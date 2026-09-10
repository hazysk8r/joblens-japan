import { Routes, Route } from 'react-router'

import HomePage from './pages/HomePage';
import CreateJobPostingPage from './pages/CreateJobPostingPage';



function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/job-postings/new"
        element={<CreateJobPostingPage />}
      />
    </Routes>
  );
}

export default App;