import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./index.css";
import Home from "./pages/Home.jsx";
import ProjectView from "./pages/ProjectView.jsx";
import InterviewDetail from "./pages/InterviewDetail.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/project/:projectId" element={<ProjectView />} />
        <Route
          path="/project/:projectId/interview/:interviewId"
          element={<InterviewDetail />}
        />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
