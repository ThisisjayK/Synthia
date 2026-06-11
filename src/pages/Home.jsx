import { useNavigate } from "react-router-dom";

export default function Home() {
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          My Research Projects
        </h1>
        <button className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-blue-700">
          + New Project
        </button>
      </div>
      <p className="text-gray-400 italic">
        Placeholder. Project cards and New Project modal coming in Phase 3.
      </p>
    </div>
  );
}
