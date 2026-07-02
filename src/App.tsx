import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Organizations from "./pages/Organizations";
import Projects from "./pages/Projects";
import Queues from "./pages/Queues";
import QueueDetail from "./pages/QueueDetail";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import Workers from "./pages/Workers";
import Logs from "./pages/Logs";
import DeadLetterQueue from "./pages/DeadLetterQueue";

function Protected({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <Register />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/organizations" element={<Protected><Organizations /></Protected>} />
      <Route path="/projects" element={<Protected><Projects /></Protected>} />
      <Route path="/queues" element={<Protected><Queues /></Protected>} />
      <Route path="/queues/:id" element={<Protected><QueueDetail /></Protected>} />
      <Route path="/jobs" element={<Protected><Jobs /></Protected>} />
      <Route path="/jobs/:id" element={<Protected><JobDetail /></Protected>} />
      <Route path="/workers" element={<Protected><Workers /></Protected>} />
      <Route path="/logs" element={<Protected><Logs /></Protected>} />
      <Route path="/dlq" element={<Protected><DeadLetterQueue /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
