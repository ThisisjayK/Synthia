// src/pages/ProjectView.jsx
// Project view with Interviews tab and Comparison tab.
// Uses :projectId from route (must match main.jsx route param name).
//
// Comparison tab: sticky section nav sidebar + scrollable report content.
// Nav highlight tracks scroll position via IntersectionObserver.

import EditProjectModal from "../components/EditProjectModal";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { runStage2 } from "../api/stage2";
import AddInterviewModal from "../components/AddInterviewModal";

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: "#F8F7F5",
  white: "#FFFFFF",
  border: "#E2E1DF",
  text: "#1A1A1A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  accent: "#5B50E8",
  accentLight: "#EEEDFB",
  accentHover: "#4840D4",
  successText: "#166534",
  successBg: "#DCFCE7",
  warningText: "#92400E",
  warningBg: "#FEF3C7",
  warningBorder: "#FDE68A",
  errorText: "#DC2626",
  errorBg: "#FEF2F2",
  errorBorder: "#FCA5A5",
};

// ─── Section config ───────────────────────────────────────────────────────────

const SECTION_CONFIG = [
  { key: "recurring_pain_points", title: "Recurring pain points" },
  { key: "consensus_jtbd", title: "Consensus JTBD" },
  { key: "shared_workarounds", title: "Shared workarounds" },
  { key: "divergent_signals", title: "Divergent signals" },
  { key: "emotional_hotspots", title: "Emotional hotspots" },
  { key: "underserved_segment_signals", title: "Underserved segments" },
  { key: "aggregate_what_to_build", title: "What to build" },
];

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const config = {
    not_run: { bg: "#F1F0EE", color: "#64748B", label: "Not analyzed" },
    complete: { bg: C.successBg, color: C.successText, label: "Complete" },
    outdated: { bg: C.warningBg, color: C.warningText, label: "Outdated" },
  };
  const s = config[status] ?? config.not_run;
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: "20px",
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

// ─── Input type badge ─────────────────────────────────────────────────────────

function InputTypeBadge({ inputType }) {
  const labels = {
    manual: "Manual Notes",
    ai_notes: "AI Note-Taker",
    transcript: "Transcript",
  };
  return (
    <span
      style={{
        fontSize: "11px",
        fontWeight: 500,
        padding: "2px 8px",
        borderRadius: "20px",
        background: C.accentLight,
        color: C.accent,
        whiteSpace: "nowrap",
      }}
    >
      {labels[inputType] ?? inputType}
    </span>
  );
}

// ─── Staleness banner ─────────────────────────────────────────────────────────

function StalenessBanner({ currentCount, generatedCount, onRerun }) {
  return (
    <div
      style={{
        marginBottom: "24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: C.warningBg,
        border: `1px solid ${C.warningBorder}`,
        borderRadius: "8px",
        padding: "12px 16px",
        fontSize: "13px",
        color: C.warningText,
        gap: "16px",
      }}
    >
      <span>
        Report generated with {generatedCount} interview
        {generatedCount !== 1 ? "s" : ""}. You now have {currentCount} analyzed.
        Re-run to include all.
      </span>
      <button
        onClick={onRerun}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: "13px",
          fontWeight: 600,
          color: C.warningText,
          textDecoration: "underline",
          textUnderlineOffset: "2px",
          padding: 0,
          flexShrink: 0,
        }}
      >
        Re-run comparison
      </button>
    </div>
  );
}

// ─── Report item ──────────────────────────────────────────────────────────────

function ReportItem({ item }) {
  if (typeof item === "string") {
    return <span style={{ color: C.text }}>{item}</span>;
  }

  const mainKeys = [
    "pain_point",
    "jtbd",
    "workaround",
    "signal",
    "topic",
    "emotion",
    "segment",
    "finding",
    "description",
  ];
  const mainKey = mainKeys.find((k) => typeof item[k] === "string");
  const mainText = mainKey
    ? item[mainKey]
    : Object.values(item).find((v) => typeof v === "string");

  const interviews = item.interviews ?? item.interview_labels ?? item.sources;
  const frequency = item.frequency ?? item.count;

  return (
    <div>
      <span style={{ color: C.text, fontSize: "14px", lineHeight: "1.6" }}>
        {mainText ?? JSON.stringify(item)}
      </span>
      {frequency != null && (
        <span
          style={{ color: C.textMuted, fontSize: "12px", marginLeft: "6px" }}
        >
          ({frequency}x)
        </span>
      )}
      {interviews && (
        <p
          style={{ color: C.textMuted, fontSize: "12px", margin: "2px 0 0 0" }}
        >
          {Array.isArray(interviews) ? interviews.join(", ") : interviews}
        </p>
      )}
    </div>
  );
}

// ─── Section content ──────────────────────────────────────────────────────────

function SectionContent({ sectionKey, content }) {
  if (sectionKey === "aggregate_what_to_build") {
    if (typeof content === "string") {
      return (
        <p
          style={{
            fontSize: "14px",
            color: C.text,
            lineHeight: "1.7",
            margin: 0,
          }}
        >
          {content}
        </p>
      );
    }
    if (typeof content === "object" && content !== null) {
      return (
        <div>
          {content.summary && (
            <p
              style={{
                fontSize: "14px",
                color: C.text,
                lineHeight: "1.7",
                margin: "0 0 12px 0",
              }}
            >
              {content.summary}
            </p>
          )}
          {Array.isArray(content.recommendations) && (
            <ol style={{ margin: 0, padding: "0 0 0 20px" }}>
              {content.recommendations.map((rec, i) => (
                <li
                  key={i}
                  style={{
                    fontSize: "14px",
                    color: C.text,
                    lineHeight: "1.65",
                    marginBottom: "8px",
                  }}
                >
                  {typeof rec === "string"
                    ? rec
                    : (rec.recommendation ?? JSON.stringify(rec))}
                  {rec.evidence && (
                    <span
                      style={{
                        color: C.textMuted,
                        marginLeft: "6px",
                        fontSize: "12px",
                      }}
                    >
                      ({rec.evidence})
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      );
    }
  }

  if (typeof content === "string") {
    return (
      <p
        style={{
          fontSize: "14px",
          color: C.textSecondary,
          fontStyle: "italic",
          margin: 0,
        }}
      >
        {content}
      </p>
    );
  }

  if (Array.isArray(content)) {
    return (
      <ul style={{ margin: 0, padding: "0 0 0 18px" }}>
        {content.map((item, i) => (
          <li key={i} style={{ marginBottom: "8px" }}>
            <ReportItem item={item} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <pre
      style={{
        fontSize: "12px",
        color: C.textSecondary,
        whiteSpace: "pre-wrap",
        margin: 0,
      }}
    >
      {JSON.stringify(content, null, 2)}
    </pre>
  );
}

// ─── Comparison report with sticky nav ───────────────────────────────────────

function ComparisonReport({ report }) {
  const [activeSection, setActiveSection] = useState(SECTION_CONFIG[0].key);
  const sectionRefs = useRef({});

  // Build list of sections that actually have content
  const presentSections = SECTION_CONFIG.filter(({ key }) => !!report[key]);

  // IntersectionObserver: update active nav item as user scrolls
  useEffect(() => {
    if (presentSections.length === 0) return;

    const observers = [];

    presentSections.forEach(({ key }) => {
      const el = sectionRefs.current[key];
      if (!el) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveSection(key);
          }
        },
        {
          // Fire when the top 20% of a section enters the top 40% of the viewport
          rootMargin: "-10% 0px -55% 0px",
          threshold: 0,
        },
      );

      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((o) => o.disconnect());
  }, [presentSections.length]);

  function scrollToSection(key) {
    const el = sectionRefs.current[key];
    if (!el) return;
    const topOffset = 80; // account for fixed top bar (56px) + breathing room
    const y = el.getBoundingClientRect().top + window.scrollY - topOffset;
    window.scrollTo({ top: y, behavior: "smooth" });
    setActiveSection(key);
  }

  if (!report || presentSections.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: "40px", alignItems: "flex-start" }}>
      {/* ── Sticky section nav ── */}
      <nav
        aria-label="Report sections"
        style={{
          flexShrink: 0,
          width: "168px",
          position: "sticky",
          top: "80px",
        }}
      >
        <p
          style={{
            fontSize: "11px",
            fontWeight: 600,
            color: C.textMuted,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            margin: "0 0 12px 0",
          }}
        >
          Sections
        </p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {presentSections.map(({ key, title }) => {
            const isActive = activeSection === key;
            return (
              <li key={key}>
                <button
                  onClick={() => scrollToSection(key)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    borderLeft: `2px solid ${isActive ? C.accent : C.border}`,
                    padding: "6px 0 6px 12px",
                    fontSize: "13px",
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? C.accent : C.textSecondary,
                    cursor: "pointer",
                    transition: "color 0.15s ease, border-color 0.15s ease",
                    lineHeight: "1.4",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.color = C.text;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      e.currentTarget.style.color = C.textSecondary;
                  }}
                >
                  {title}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Section cards ── */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {presentSections.map(({ key, title }) => (
          <div
            key={key}
            id={`section-${key}`}
            ref={(el) => {
              sectionRefs.current[key] = el;
            }}
            style={{
              background: C.white,
              border: `1px solid ${C.border}`,
              borderLeft: `3px solid ${C.accent}`,
              borderRadius: "8px",
              padding: "20px 24px",
            }}
          >
            <h3
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: C.textSecondary,
                margin: "0 0 14px 0",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              {title}
            </h3>
            <SectionContent sectionKey={key} content={report[key]} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectView() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [interviews, setInterviews] = useState([]);
  const [report, setReport] = useState(null);
  const [activeTab, setActiveTab] = useState("interviews");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [runError, setRunError] = useState(null);

  const loadProject = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [
        { data: projectData, error: projectError },
        { data: interviewData, error: interviewError },
      ] = await Promise.all([
        supabase.from("projects").select("*").eq("id", projectId).single(),
        supabase
          .from("interviews")
          .select(
            "id, label, segment_tag, input_type, date_conducted, analysis_status, date_analyzed, created_at",
          )
          .eq("project_id", projectId)
          .order("created_at", { ascending: true }),
      ]);

      if (projectError) {
        console.error("Project fetch error:", projectError);
        // PGRST116 = no rows found = genuine not found, not a network error
        if (projectError.code !== "PGRST116") setLoadError(true);
      }
      if (interviewError)
        console.error("Interview fetch error:", interviewError);

      setProject(projectData ?? null);
      setInterviews(interviewData ?? []);
    } catch (err) {
      console.error("loadProject failed:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadReport = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("comparison_reports")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();

      if (error) {
        console.error("Report fetch error:", error);
        return;
      }

      if (data && typeof data.stage2_output === "string") {
        try {
          data.stage2_output = JSON.parse(data.stage2_output);
        } catch {
          // Leave as-is; fallback renderer handles it.
        }
      }

      setReport(data ?? null);
    } catch (err) {
      console.error("loadReport failed:", err);
    }
  }, [projectId]);

  useEffect(() => {
    loadProject();
    loadReport();
  }, [loadProject, loadReport]);

  const completeInterviews = interviews.filter(
    (i) => i.analysis_status === "complete",
  );

  const isStale =
    report &&
    completeInterviews.length > (report.interview_count_at_generation ?? 0);

  const hasReport = !!(report && report.stage2_output);

  async function handleRunComparison() {
    setRunError(null);
    setReportLoading(true);
    try {
      await runStage2({ projectId });
      await loadReport();
    } catch (err) {
      setRunError(err.message ?? "Comparison failed. Please try again.");
    } finally {
      setReportLoading(false);
    }
  }

  function handleInterviewAdded() {
    setShowAddModal(false);
    loadProject();
  }

  // ── Loading ──
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
        }}
      >
        <div
          style={{
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            border: `2px solid ${C.border}`,
            borderTopColor: C.accent,
            animation: "spin 0.8s linear infinite",
          }}
        />
        <span style={{ fontSize: "13px", color: C.textMuted }}>
          Loading project...
        </span>
      </div>
    );
  }

  // ── Load error (network/Supabase failure, distinct from not found) ──
  if (loadError) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
        }}
      >
        <p
          style={{
            fontSize: "15px",
            color: C.text,
            fontWeight: 500,
            margin: 0,
          }}
        >
          Could not load project
        </p>
        <p style={{ fontSize: "14px", color: C.textSecondary, margin: 0 }}>
          Check your connection and try again.
        </p>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={loadProject}
            style={{
              background: C.accent,
              color: C.white,
              border: "none",
              borderRadius: "6px",
              padding: "8px 18px",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
          <button
            onClick={() => navigate("/")}
            style={{
              background: "none",
              border: `1px solid ${C.border}`,
              borderRadius: "6px",
              padding: "8px 16px",
              fontSize: "13px",
              color: C.textSecondary,
              cursor: "pointer",
            }}
          >
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  // ── Not found ──
  if (!project) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
        }}
      >
        <p
          style={{
            fontSize: "15px",
            color: C.text,
            fontWeight: 500,
            margin: 0,
          }}
        >
          Project not found.
        </p>
        <button
          onClick={() => navigate("/")}
          style={{
            background: "none",
            border: `1px solid ${C.border}`,
            borderRadius: "6px",
            padding: "8px 16px",
            fontSize: "13px",
            color: C.textSecondary,
            cursor: "pointer",
          }}
        >
          Back to projects
        </button>
      </div>
    );
  }

  // Widen max-width only when the report sidebar is visible
  const contentMaxWidth =
    hasReport && activeTab === "comparison" ? "1080px" : "880px";

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      {/* ── Top bar ── */}
      <div
        style={{
          borderBottom: `1px solid ${C.border}`,
          background: C.white,
          padding: "0 40px",
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <button
          onClick={() => navigate("/")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            color: C.textSecondary,
            padding: 0,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = C.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = C.textSecondary)}
        >
          ← All projects
        </button>
        <span
          style={{
            fontSize: "15px",
            fontWeight: 700,
            color: C.text,
            letterSpacing: "-0.02em",
          }}
        >
          synthia
        </span>
      </div>

      {/* ── Page content ── */}
      <div
        style={{
          maxWidth: contentMaxWidth,
          margin: "0 auto",
          padding: "48px 40px",
          transition: "max-width 0.2s ease",
        }}
      >
        {/* ── Project header ── */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            marginBottom: "32px",
            gap: "24px",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "4px",
              }}
            >
              <h1
                style={{
                  fontSize: "22px",
                  fontWeight: 600,
                  color: C.text,
                  margin: 0,
                  letterSpacing: "-0.02em",
                }}
              >
                {project.name}
              </h1>
              {project.is_demo && (
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: C.accent,
                    background: C.accentLight,
                    padding: "2px 8px",
                    borderRadius: "4px",
                  }}
                >
                  Demo
                </span>
              )}
            </div>
            {project.domain && (
              <p
                style={{
                  fontSize: "13px",
                  color: C.textSecondary,
                  margin: "0 0 6px 0",
                }}
              >
                {project.domain}
              </p>
            )}
            <p style={{ fontSize: "12px", color: C.textMuted, margin: 0 }}>
              {interviews.length} interview{interviews.length !== 1 ? "s" : ""}
              {completeInterviews.length !== interviews.length &&
                completeInterviews.length > 0 &&
                ` (${completeInterviews.length} analyzed)`}
            </p>
            {!project.is_demo && (
              <button
                onClick={() => setShowEditModal(true)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: C.accent,
                  padding: "4px 0 0 0",
                  display: "block",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = C.accentHover)
                }
                onMouseLeave={(e) => (e.currentTarget.style.color = C.accent)}
              >
                Edit project
              </button>
            )}
          </div>

          {!project.is_demo && (
            <button
              onClick={() => setShowAddModal(true)}
              style={{
                background: C.accent,
                color: C.white,
                border: "none",
                borderRadius: "6px",
                padding: "9px 18px",
                fontSize: "13px",
                fontWeight: 500,
                cursor: "pointer",
                flexShrink: 0,
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = C.accentHover)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = C.accent)
              }
            >
              + Add Interview
            </button>
          )}
        </div>

        {/* ── Tab bar ── */}
        <div
          style={{
            display: "flex",
            gap: "24px",
            borderBottom: `1px solid ${C.border}`,
            marginBottom: "28px",
          }}
        >
          {["interviews", "comparison"].map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: `2px solid ${active ? C.accent : "transparent"}`,
                  padding: "0 0 12px 0",
                  fontSize: "14px",
                  fontWeight: active ? 600 : 400,
                  color: active ? C.accent : C.textSecondary,
                  cursor: "pointer",
                  transition: "color 0.15s ease, border-color 0.15s ease",
                  textTransform: "capitalize",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = C.text;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = C.textSecondary;
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* ── Interviews tab ── */}
        {activeTab === "interviews" && (
          <div>
            {interviews.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "64px 24px",
                  color: C.textMuted,
                }}
              >
                <p
                  style={{
                    fontSize: "15px",
                    fontWeight: 500,
                    color: C.text,
                    marginBottom: "8px",
                  }}
                >
                  No interviews yet
                </p>
                {!project.is_demo && (
                  <button
                    onClick={() => setShowAddModal(true)}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "14px",
                      color: C.accent,
                      padding: 0,
                      marginTop: "4px",
                    }}
                  >
                    Add your first interview to get started
                  </button>
                )}
              </div>
            ) : (
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                {interviews.map((interview) => (
                  <li
                    key={interview.id}
                    onClick={() =>
                      navigate(
                        `/project/${projectId}/interview/${interview.id}`,
                      )
                    }
                    style={{
                      background: C.white,
                      border: `1px solid ${C.border}`,
                      borderRadius: "8px",
                      padding: "14px 18px",
                      cursor: "pointer",
                      transition:
                        "border-color 0.15s ease, box-shadow 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = C.accent;
                      e.currentTarget.style.boxShadow = `0 0 0 1px ${C.accentLight}`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = C.border;
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "8px",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "14px",
                          fontWeight: 500,
                          color: C.text,
                        }}
                      >
                        {interview.label}
                      </span>
                      <StatusBadge status={interview.analysis_status} />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        flexWrap: "wrap",
                      }}
                    >
                      <InputTypeBadge inputType={interview.input_type} />
                      {interview.segment_tag && (
                        <span style={{ fontSize: "12px", color: C.textMuted }}>
                          {interview.segment_tag}
                        </span>
                      )}
                      {interview.date_conducted && (
                        <span style={{ fontSize: "12px", color: C.textMuted }}>
                          {new Date(
                            interview.date_conducted,
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      )}
                      {interview.analysis_status === "complete" &&
                        interview.date_analyzed && (
                          <span
                            style={{ fontSize: "12px", color: C.textMuted }}
                          >
                            Analyzed{" "}
                            {new Date(
                              interview.date_analyzed,
                            ).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── Comparison tab ── */}
        {activeTab === "comparison" && (
          <div>
            {isStale && (
              <StalenessBanner
                currentCount={completeInterviews.length}
                generatedCount={report.interview_count_at_generation}
                onRerun={handleRunComparison}
              />
            )}

            {/* Not enough interviews */}
            {completeInterviews.length < 2 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "64px 24px",
                  color: C.textMuted,
                }}
              >
                <p
                  style={{
                    fontSize: "15px",
                    fontWeight: 500,
                    color: C.text,
                    marginBottom: "8px",
                  }}
                >
                  Not enough analyzed interviews
                </p>
                <p style={{ fontSize: "14px", marginBottom: 0 }}>
                  You need at least 2 analyzed interviews to run a comparison.
                  Unanalyzed interviews are not included.
                </p>
              </div>
            ) : (
              <>
                {/* Interviews included + run button row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "24px",
                    marginBottom: "28px",
                    paddingBottom: "24px",
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: C.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: "8px",
                        marginTop: 0,
                      }}
                    >
                      Interviews included ({completeInterviews.length})
                    </p>
                    <ul
                      style={{
                        listStyle: "none",
                        margin: 0,
                        padding: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: "4px",
                      }}
                    >
                      {completeInterviews.map((i) => (
                        <li
                          key={i.id}
                          style={{
                            fontSize: "13px",
                            color: C.textSecondary,
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              color: C.successText,
                              fontWeight: 700,
                            }}
                          >
                            ✓
                          </span>
                          {i.label}
                          {i.segment_tag && (
                            <span
                              style={{ color: C.textMuted, fontSize: "12px" }}
                            >
                              ({i.segment_tag})
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {!project.is_demo && (
                    <div style={{ flexShrink: 0 }}>
                      <button
                        onClick={handleRunComparison}
                        disabled={reportLoading}
                        style={{
                          background: reportLoading ? "#A5A0F0" : C.accent,
                          color: C.white,
                          border: "none",
                          borderRadius: "6px",
                          padding: "9px 18px",
                          fontSize: "13px",
                          fontWeight: 500,
                          cursor: reportLoading ? "not-allowed" : "pointer",
                          transition: "background 0.15s ease",
                          whiteSpace: "nowrap",
                        }}
                        onMouseEnter={(e) => {
                          if (!reportLoading)
                            e.currentTarget.style.background = C.accentHover;
                        }}
                        onMouseLeave={(e) => {
                          if (!reportLoading)
                            e.currentTarget.style.background = C.accent;
                        }}
                      >
                        {reportLoading
                          ? `Synthesizing ${completeInterviews.length} interviews...`
                          : report
                            ? "Re-run comparison"
                            : "Run comparison"}
                      </button>

                      {report && !reportLoading && (
                        <p
                          style={{
                            fontSize: "11px",
                            color: C.textMuted,
                            margin: "6px 0 0 0",
                            textAlign: "right",
                          }}
                        >
                          Last run{" "}
                          {new Date(report.generated_at).toLocaleDateString(
                            "en-US",
                            {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Run error */}
                {runError && (
                  <div
                    style={{
                      marginBottom: "20px",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      background: C.errorBg,
                      border: `1px solid ${C.errorBorder}`,
                      borderRadius: "8px",
                      padding: "12px 16px",
                      fontSize: "13px",
                      color: C.errorText,
                    }}
                  >
                    <span>{runError}</span>
                    <button
                      onClick={handleRunComparison}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: 600,
                        color: C.errorText,
                        textDecoration: "underline",
                        padding: 0,
                        flexShrink: 0,
                      }}
                    >
                      Try again
                    </button>
                  </div>
                )}

                {/* Report with sticky nav */}
                {hasReport && (
                  <ComparisonReport report={report.stage2_output} />
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showAddModal && (
        <AddInterviewModal
          projectId={projectId}
          isDemo={project.is_demo}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleInterviewAdded}
        />
      )}

      {showEditModal && (
        <EditProjectModal
          project={project}
          onClose={() => setShowEditModal(false)}
          onSuccess={(updatedProject) => {
            setProject(updatedProject);
            setShowEditModal(false);
          }}
        />
      )}
    </div>
  );
}
