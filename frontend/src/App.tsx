import { Routes, Route } from 'react-router'

import HomePage from './pages/HomePage';
import CreateJobPostingPage from './pages/CreateJobPostingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import NotFoundPage from './pages/NotFoundPage';
import RequireAuth from './auth/RequireAuth';



function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* ログインが必要な画面 */}
      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/job-postings/new"
          element={<CreateJobPostingPage />}
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
