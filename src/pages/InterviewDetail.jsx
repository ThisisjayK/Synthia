import { useParams, useNavigate } from "react-router-dom";

export default function InterviewDetail() {
  const { projectId, interviewId } = useParams();
  const navigate = useNavigate();

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <button
        onClick={() => navigate(`/project/${projectId}`)}
        className="text-sm text-blue-600 hover:underline mb-6 block"
      >
        &larr; Back to project
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Interview Detail
      </h1>

      {/* Two-panel layout shell */}
      <div className="grid grid-cols-2 gap-6 mt-6">
        <div className="border border-gray-200 rounded-md p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Raw Input
          </h2>
          <p className="text-gray-400 italic text-sm">
            Placeholder. Interview content and anonymization badge coming in
            Phase 2.
          </p>
        </div>
        <div className="border border-gray-200 rounded-md p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">
            Analysis Output
          </h2>
          <p className="text-gray-400 italic text-sm">
            Placeholder. 7-bucket analysis output coming in Phase 2.
          </p>
        </div>
      </div>

      {/* Dev reference */}
      <p className="mt-8 text-xs text-gray-300">
        Project: {projectId} / Interview: {interviewId}
      </p>
    </div>
  );
}
