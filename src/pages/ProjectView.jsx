import { useParams, useNavigate } from "react-router-dom";

export default function ProjectView() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <button
        onClick={() => navigate("/")}
        className="text-sm text-blue-600 hover:underline mb-6 block"
      >
        &larr; Back to projects
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Project View</h1>
        <button className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-700">
          + Add Interview
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-6 border-b border-gray-200 mb-6">
        <button className="pb-2 text-sm font-medium text-blue-600 border-b-2 border-blue-600">
          Interviews
        </button>
        <button className="pb-2 text-sm font-medium text-gray-500 hover:text-gray-700">
          Comparison
        </button>
      </div>

      {/* Interviews tab content */}
      <p className="text-gray-400 italic text-sm">
        Placeholder. Interview cards, Add Interview modal, and Comparison tab
        coming in Phase 3.
      </p>

      {/* Dev reference */}
      <p className="mt-8 text-xs text-gray-300">Project ID: {id}</p>

      {/* Test link to interview detail */}
      <button
        onClick={() => navigate(`/project/${id}/interview/test-interview-id`)}
        className="mt-4 text-xs text-blue-400 hover:underline block"
      >
        Dev: open interview detail placeholder &rarr;
      </button>
    </div>
  );
}
