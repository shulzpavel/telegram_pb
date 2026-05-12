import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import CmsPage from "./pages/CmsPage";
import DemoPage from "./pages/DemoPage";
import ManagerPage from "./features/manager/ManagerPage";
import SessionPage from "./pages/SessionPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/cms/*" element={<CmsPage />} />
        <Route path="/manage" element={<ManagerPage />} />
        <Route path="/s/:token" element={<SessionPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/" element={<Navigate to="/manage" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
