// src/pages/Home.jsx
// Home screen: lists all projects as cards, sorted by last updated.
// Demo project always shown first with a read-only badge.
// Owns modal state for New Project and How It Works.

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import NewProjectModal from "../components/NewProjectModal";
import HowItWorksModal from "../components/HowItWorksModal";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Demo badge ─────────────────────────────────────────────────────────────

function DemoBadge() {
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "#5B50E8",
        background: "#EEEDFB",
        padding: "2px 8px",
        borderRadius: "4px",
      }}
    >
      Demo
    </span>
  );
}

// ─── Count badge ─────────────────────────────────────────────────────────────

function CountBadge({ count }) {
  const label = count === 1 ? "interview" : "interviews";
  return (
    <span
      style={{
        fontSize: "12px",
        color: "#64748B",
        background: "#F1F0EE",
        padding: "2px 8px",
        borderRadius: "4px",
        fontWeight: 500,
      }}
    >
      {count} {label}
    </span>
  );
}

// ─── Project card ────────────────────────────────────────────────────────────

function ProjectCard({ project, onClick }) {
  const isDemo = project.is_demo;

  return (
    <div
      onClick={onClick}
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E1DF",
        borderTop: `3px solid ${isDemo ? "#C4C1F5" : "#5B50E8"}`,
        borderRadius: "8px",
        padding: "20px 24px",
        cursor: "pointer",
        transition: "box-shadow 0.15s ease, transform 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Card header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "10px",
          gap: "12px",
        }}
      >
        <h2
          style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "#1A1A1A",
            lineHeight: "1.3",
            margin: 0,
          }}
        >
          {project.name}
        </h2>
        {isDemo && <DemoBadge />}
      </div>

      {/* Domain tag */}
      {project.domain && (
        <p
          style={{
            fontSize: "12px",
            color: "#64748B",
            marginBottom: "16px",
            marginTop: 0,
          }}
        >
          {project.domain}
        </p>
      )}

      {/* Footer row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: project.domain ? 0 : "16px",
        }}
      >
        <CountBadge count={project.interview_count ?? 0} />
        {project.updated_at && (
          <span style={{ fontSize: "11px", color: "#94A3B8" }}>
            Updated {formatDate(project.updated_at)}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onNewProject }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "64px 24px",
        color: "#64748B",
      }}
    >
      <p
        style={{
          fontSize: "15px",
          marginBottom: "8px",
          color: "#1A1A1A",
          fontWeight: 500,
        }}
      >
        No projects yet
      </p>
      <p style={{ fontSize: "14px", marginBottom: "24px" }}>
        Organise your user interview research by project.
      </p>
      <button
        onClick={onNewProject}
        style={{
          background: "#5B50E8",
          color: "#FFFFFF",
          border: "none",
          borderRadius: "6px",
          padding: "10px 20px",
          fontSize: "14px",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Create your first project
      </button>
    </div>
  );
}

// ─── Error state ─────────────────────────────────────────────────────────────

function ErrorState({ onRetry }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "64px 24px",
        color: "#64748B",
      }}
    >
      <p
        style={{
          fontSize: "15px",
          marginBottom: "8px",
          color: "#1A1A1A",
          fontWeight: 500,
        }}
      >
        Could not load projects
      </p>
      <p style={{ fontSize: "14px", marginBottom: "24px" }}>
        Check your connection and try again.
      </p>
      <button
        onClick={onRetry}
        style={{
          background: "transparent",
          color: "#5B50E8",
          border: "1px solid #5B50E8",
          borderRadius: "6px",
          padding: "10px 20px",
          fontSize: "14px",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function Home() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showHowItWorksModal, setShowHowItWorksModal] = useState(false);

  async function fetchProjects() {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("projects")
      .select(
        `
        id,
        name,
        domain,
        is_demo,
        updated_at,
        interviews(count)
        `,
      )
      .order("is_demo", { ascending: false })
      .order("updated_at", { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    const normalized = (data ?? []).map((p) => ({
      ...p,
      interview_count: p.interviews?.[0]?.count ?? 0,
    }));

    setProjects(normalized);
    setLoading(false);
  }

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleNewProject = () => setShowNewProjectModal(true);

  const handleProjectCreated = (newProject) => {
    setShowNewProjectModal(false);
    navigate(`/project/${newProject.id}`);
  };

  const handleProjectClick = (project) => {
    navigate(`/project/${project.id}`);
  };

  const demoProjects = projects.filter((p) => p.is_demo);
  const realProjects = projects.filter((p) => !p.is_demo);
  const hasRealProjects = realProjects.length > 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F8F7F5",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          borderBottom: "1px solid #E2E1DF",
          background: "#FFFFFF",
          padding: "0 40px",
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: "15px",
            fontWeight: 700,
            color: "#1A1A1A",
            letterSpacing: "-0.02em",
          }}
        >
          synthia
        </span>
        <button
          onClick={() => setShowHowItWorksModal(true)}
          style={{
            fontSize: "13px",
            color: "#5B50E8",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontFamily: "inherit",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#4840D4")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#5B50E8")}
        >
          How it works
        </button>
      </div>

      {/* Page content */}
      <div
        style={{
          maxWidth: "880px",
          margin: "0 auto",
          padding: "48px 40px",
        }}
      >
        {/* Page header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "32px",
          }}
        >
          <h1
            style={{
              fontSize: "22px",
              fontWeight: 600,
              color: "#1A1A1A",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            My Research Projects
          </h1>
          {hasRealProjects && (
            <button
              onClick={handleNewProject}
              style={{
                background: "#5B50E8",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "6px",
                padding: "9px 18px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: "0.01em",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#4840D4")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "#5B50E8")
              }
            >
              + New Project
            </button>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div
            style={{
              padding: "64px 0",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                border: "2px solid #E2E1DF",
                borderTopColor: "#5B50E8",
                animation: "spin 0.8s linear infinite",
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: "13px", color: "#94A3B8" }}>
              Loading projects...
            </span>
          </div>
        )}

        {/* Error state */}
        {!loading && error && <ErrorState onRetry={fetchProjects} />}

        {/* Empty state */}
        {!loading && !error && !hasRealProjects && (
          <>
            {demoProjects.length > 0 && (
              <>
                <p
                  style={{
                    fontSize: "13px",
                    color: "#94A3B8",
                    marginBottom: "16px",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Demo
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "16px",
                    marginBottom: "40px",
                  }}
                >
                  {demoProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onClick={() => handleProjectClick(project)}
                    />
                  ))}
                </div>
              </>
            )}
            <EmptyState onNewProject={handleNewProject} />
          </>
        )}

        {/* Populated state */}
        {!loading && !error && hasRealProjects && (
          <>
            {demoProjects.length > 0 && (
              <>
                <p
                  style={{
                    fontSize: "13px",
                    color: "#94A3B8",
                    marginBottom: "16px",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Demo
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "16px",
                    marginBottom: "40px",
                  }}
                >
                  {demoProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      onClick={() => handleProjectClick(project)}
                    />
                  ))}
                </div>
              </>
            )}

            <p
              style={{
                fontSize: "13px",
                color: "#94A3B8",
                marginBottom: "16px",
                fontWeight: 500,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Projects
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: "16px",
              }}
            >
              {realProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onClick={() => handleProjectClick(project)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {showNewProjectModal && (
        <NewProjectModal
          onClose={() => setShowNewProjectModal(false)}
          onSuccess={handleProjectCreated}
        />
      )}

      {showHowItWorksModal && (
        <HowItWorksModal onClose={() => setShowHowItWorksModal(false)} />
      )}
    </div>
  );
}
