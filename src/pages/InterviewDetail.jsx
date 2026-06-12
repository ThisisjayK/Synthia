// src/pages/InterviewDetail.jsx
// Two-panel view: left = raw input, right = analysis output.
// PRD Section 9.6.
//
// Left panel:
//   - Raw input text (read-only by default, editable on click of Edit)
//   - Anonymization status badge (green = anonymized, grey = not anonymized)
//   - Clicking the badge expands the substitution log
//   - If edited and unsaved, warns before navigating away
//   - Save button appears when editing
//
// Right panel:
//   - All 7 analysis buckets rendered in labeled sections
//   - If analysis_status = not_run: shows Anonymize and Analyze / Analyze buttons
//   - If analysis_status = outdated: shows yellow banner + Re-analyze button
//   - If analysis_status = complete: shows full output
//   - Notable quotes rendered in styled quote blocks

import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { runStage0 } from "../api/stage0";
import { runStage1 } from "../api/stage1";
import HowItWorksModal from "../components/HowItWorksModal";

// ─── Constants ────────────────────────────────────────────────────────────────

const SHARED_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const COLORS = {
  bg: "#F8F7F5",
  white: "#FFFFFF",
  border: "#E2E1DF",
  text: "#1A1A1A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  accent: "#5B50E8",
  accentLight: "#EEEDFB",
  accentHover: "#4840D4",
  accentDisabled: "#A5A0F0",
  successText: "#166534",
  successBg: "#DCFCE7",
  warningText: "#92400E",
  warningBg: "#FEF3C7",
  errorText: "#DC2626",
  errorBg: "#FEF2F2",
};

const BUCKET_CONFIG = [
  { key: "pain_points", label: "Pain Points" },
  { key: "current_workarounds", label: "Current Workarounds" },
  { key: "jobs_to_be_done", label: "Jobs to Be Done" },
  { key: "emotional_signals", label: "Emotional Signals" },
  { key: "notable_quotes", label: "Notable Quotes" },
  { key: "unmet_needs", label: "Unmet Needs" },
  { key: "what_to_build", label: "What to Build" },
];

const INPUT_TYPE_LABELS = {
  manual: "Manual Notes",
  ai_notes: "AI Note-Taker Output",
  transcript: "Full Transcript",
};

const METHOD_LABELS = {
  remote_call: "Remote Call",
  in_person: "In-Person",
  async_written: "Async Written",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(isoString) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Small components ─────────────────────────────────────────────────────────

function PrimaryButton({ onClick, disabled, loading, children, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        background: disabled || loading ? COLORS.accentDisabled : COLORS.accent,
        color: COLORS.white,
        border: "none",
        borderRadius: "6px",
        padding: "8px 16px",
        fontSize: "13px",
        fontWeight: 500,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        fontFamily: SHARED_FONT,
        transition: "background 0.15s ease",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading)
          e.currentTarget.style.background = COLORS.accentHover;
      }}
      onMouseLeave={(e) => {
        if (!disabled && !loading)
          e.currentTarget.style.background = COLORS.accent;
      }}
    >
      {children}
    </button>
  );
}

function GhostButton({ onClick, disabled, children, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "none",
        border: `1px solid ${COLORS.border}`,
        borderRadius: "6px",
        padding: "8px 16px",
        fontSize: "13px",
        fontWeight: 500,
        color: disabled ? COLORS.textMuted : COLORS.textSecondary,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: SHARED_FONT,
        transition: "border-color 0.15s ease, color 0.15s ease",
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = COLORS.textSecondary;
          e.currentTarget.style.color = COLORS.text;
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = COLORS.border;
          e.currentTarget.style.color = COLORS.textSecondary;
        }
      }}
    >
      {children}
    </button>
  );
}

// ─── Quote block ──────────────────────────────────────────────────────────────

function QuoteBlock({ text }) {
  // Try to split the quote from the attribution tag at the end.
  // Format from prompt: "quote text" (Interview Label)
  const match = text.match(/^"(.+)"\s*\((.+)\)$/s);
  const quoteText = match ? match[1] : text.replace(/^"|"$/g, "");
  const attribution = match ? match[2] : null;

  return (
    <div
      style={{
        borderLeft: `3px solid ${COLORS.accent}`,
        paddingLeft: "14px",
        marginBottom: "12px",
      }}
    >
      <p
        style={{
          fontSize: "14px",
          color: COLORS.text,
          fontStyle: "italic",
          lineHeight: "1.6",
          margin: "0 0 4px 0",
        }}
      >
        "{quoteText}"
      </p>
      {attribution && (
        <p
          style={{
            fontSize: "11px",
            color: COLORS.textMuted,
            margin: 0,
            fontStyle: "normal",
          }}
        >
          {attribution}
        </p>
      )}
    </div>
  );
}

// ─── Bucket section ───────────────────────────────────────────────────────────

function BucketSection({ label, bucketKey, value }) {
  const isEmpty =
    !value ||
    (Array.isArray(value) && value.length === 0) ||
    (Array.isArray(value) &&
      value.length === 1 &&
      value[0] === "Not enough information provided") ||
    value === "Not enough information provided";

  return (
    <div style={{ marginBottom: "28px" }}>
      <h3
        style={{
          fontSize: "12px",
          fontWeight: 700,
          color: COLORS.textSecondary,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          margin: "0 0 10px 0",
        }}
      >
        {label}
      </h3>

      {isEmpty ? (
        <p
          style={{
            fontSize: "13px",
            color: COLORS.textMuted,
            fontStyle: "italic",
            margin: 0,
          }}
        >
          Not enough information provided
        </p>
      ) : bucketKey === "notable_quotes" ? (
        // Quotes get special treatment
        <div>
          {(Array.isArray(value) ? value : [value]).map((item, i) => (
            <QuoteBlock key={i} text={item} />
          ))}
        </div>
      ) : bucketKey === "what_to_build" ? (
        // Prose paragraph
        <p
          style={{
            fontSize: "14px",
            color: COLORS.text,
            lineHeight: "1.7",
            margin: 0,
          }}
        >
          {typeof value === "string" ? value : value.join(" ")}
        </p>
      ) : (
        // List buckets
        <ul style={{ margin: 0, padding: "0 0 0 18px" }}>
          {(Array.isArray(value) ? value : [value]).map((item, i) => (
            <li
              key={i}
              style={{
                fontSize: "14px",
                color: COLORS.text,
                lineHeight: "1.65",
                marginBottom: "6px",
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Anonymization log panel ──────────────────────────────────────────────────

function AnonymizationLogPanel({ log }) {
  const hasSubstitutions = log && log.trim() !== "NONE" && log.trim() !== "";
  const lines = hasSubstitutions ? log.split("\n").filter((l) => l.trim()) : [];

  return (
    <div
      style={{
        marginTop: "10px",
        background: COLORS.bg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "6px",
        padding: "12px 14px",
        maxHeight: "160px",
        overflowY: "auto",
      }}
    >
      {hasSubstitutions ? (
        lines.map((line, i) => (
          <p
            key={i}
            style={{
              fontSize: "12px",
              color: COLORS.text,
              margin: "0 0 4px 0",
              fontFamily: "monospace",
            }}
          >
            {line}
          </p>
        ))
      ) : (
        <p style={{ fontSize: "12px", color: COLORS.textMuted, margin: 0 }}>
          No personal information was detected.
        </p>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InterviewDetail() {
  const { projectId, interviewId } = useParams();
  const navigate = useNavigate();

  const [interview, setInterview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Left panel state
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [showAnonLog, setShowAnonLog] = useState(false);

  // Right panel state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);

  // Modal state
  const [showHowItWorksModal, setShowHowItWorksModal] = useState(false);

  async function fetchInterview() {
    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("interviews")
      .select(
        "id, project_id, label, input_type, segment_tag, date_conducted, interviewer_name, method, raw_input_text, anonymized_text, anonymization_status, anonymization_log, analysis_status, stage1_output, date_analyzed, word_count",
      )
      .eq("id", interviewId)
      .single();

    if (fetchError || !data) {
      setError(
        "Could not load interview. Check your connection and try again.",
      );
      setLoading(false);
      return;
    }

    setInterview(data);
    setEditedText(data.raw_input_text ?? "");
    setLoading(false);
  }

  useEffect(() => {
    fetchInterview();
  }, [interviewId]);

  // Warn before navigating away with unsaved changes
  const handleNavigateBack = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm("You have unsaved changes. Leave without saving?"))
        return;
    }
    navigate(`/project/${projectId}`);
  };

  // ── Left panel: edit / save ──

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleTextChange = (e) => {
    setEditedText(e.target.value);
    setHasUnsavedChanges(e.target.value !== interview.raw_input_text);
  };

  const handleSaveEdit = async () => {
    if (!hasUnsavedChanges) {
      setIsEditing(false);
      return;
    }

    setSavingEdit(true);

    const { error: saveError } = await supabase
      .from("interviews")
      .update({
        raw_input_text: editedText,
        analysis_status: "outdated",
        // Clear anonymized text since raw changed; user must re-anonymize
        anonymized_text: null,
        anonymization_status: "not_run",
        anonymization_log: null,
      })
      .eq("id", interviewId);

    setSavingEdit(false);

    if (saveError) {
      setError("Could not save changes. Try again.");
      return;
    }

    setInterview((prev) => ({
      ...prev,
      raw_input_text: editedText,
      analysis_status: "outdated",
      anonymized_text: null,
      anonymization_status: "not_run",
      anonymization_log: null,
    }));
    setHasUnsavedChanges(false);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedText(interview.raw_input_text ?? "");
    setHasUnsavedChanges(false);
    setIsEditing(false);
  };

  // ── Right panel: run analysis ──

  const handleRunAnalysis = async () => {
    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const { analysis } = await runStage1({ interviewId });
      setInterview((prev) => ({
        ...prev,
        stage1_output: analysis,
        analysis_status: "complete",
        date_analyzed: new Date().toISOString(),
      }));
    } catch (err) {
      setAnalysisError(
        err.message ??
          "Analysis failed. This is usually temporary. Please try again.",
      );
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Loading ──
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: COLORS.bg,
          fontFamily: SHARED_FONT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: COLORS.textMuted,
          fontSize: "14px",
        }}
      >
        Loading interview...
      </div>
    );
  }

  // ── Error ──
  if (error || !interview) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: COLORS.bg,
          fontFamily: SHARED_FONT,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
        }}
      >
        <p style={{ fontSize: "15px", color: COLORS.text, fontWeight: 500 }}>
          {error ?? "Interview not found."}
        </p>
        <GhostButton onClick={() => navigate(`/project/${projectId}`)}>
          Back to project
        </GhostButton>
      </div>
    );
  }

  const isAnonymized = interview.anonymization_status === "complete";
  const displayText = isAnonymized
    ? interview.anonymized_text
    : interview.raw_input_text;
  const hasAnalysis =
    interview.analysis_status === "complete" ||
    interview.analysis_status === "outdated";
  const isOutdated = interview.analysis_status === "outdated";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        fontFamily: SHARED_FONT,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          borderBottom: `1px solid ${COLORS.border}`,
          background: COLORS.white,
          padding: "0 40px",
          height: "56px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <button
          onClick={handleNavigateBack}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            color: COLORS.textSecondary,
            padding: 0,
            fontFamily: SHARED_FONT,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
          onMouseLeave={(e) =>
            (e.currentTarget.style.color = COLORS.textSecondary)
          }
        >
          ← {interview.label}
        </button>
        <button
          onClick={() => setShowHowItWorksModal(true)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            color: COLORS.accent,
            padding: 0,
            fontFamily: SHARED_FONT,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.color = COLORS.accentHover)
          }
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.accent)}
        >
          How it works
        </button>
      </div>

      {/* Two-panel layout */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0",
          height: "calc(100vh - 56px)",
        }}
      >
        {/* ── Left panel: Raw Input ── */}
        <div
          style={{
            borderRight: `1px solid ${COLORS.border}`,
            overflowY: "auto",
            padding: "32px 36px",
            background: COLORS.white,
          }}
        >
          {/* Panel header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "20px",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: COLORS.textSecondary,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  margin: "0 0 8px 0",
                }}
              >
                Raw Input
              </h2>
              {/* Interview metadata */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px",
                  fontSize: "12px",
                  color: COLORS.textMuted,
                }}
              >
                {interview.input_type && (
                  <span>
                    {INPUT_TYPE_LABELS[interview.input_type] ??
                      interview.input_type}
                  </span>
                )}
                {interview.date_conducted && (
                  <span>{formatDate(interview.date_conducted)}</span>
                )}
                {interview.interviewer_name && (
                  <span>Interviewer: {interview.interviewer_name}</span>
                )}
                {interview.method && (
                  <span>
                    {METHOD_LABELS[interview.method] ?? interview.method}
                  </span>
                )}
              </div>
            </div>

            {/* Edit / Save / Cancel buttons */}
            {!isEditing ? (
              <GhostButton onClick={handleEditClick} style={{ flexShrink: 0 }}>
                Edit
              </GhostButton>
            ) : (
              <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                <GhostButton onClick={handleCancelEdit} disabled={savingEdit}>
                  Cancel
                </GhostButton>
                <PrimaryButton
                  onClick={handleSaveEdit}
                  loading={savingEdit}
                  disabled={!hasUnsavedChanges}
                >
                  {savingEdit ? "Saving..." : "Save"}
                </PrimaryButton>
              </div>
            )}
          </div>

          {/* Anonymization status badge */}
          <div style={{ marginBottom: "16px" }}>
            <button
              onClick={() => setShowAnonLog((v) => !v)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                fontFamily: SHARED_FONT,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: isAnonymized
                    ? COLORS.successText
                    : COLORS.textSecondary,
                  background: isAnonymized ? COLORS.successBg : "#F1F0EE",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  letterSpacing: "0.02em",
                }}
              >
                {isAnonymized
                  ? "Anonymized before analysis"
                  : "Sent without anonymization"}
              </span>
              {isAnonymized && (
                <span style={{ fontSize: "11px", color: COLORS.textMuted }}>
                  {showAnonLog ? "▲" : "▼"}
                </span>
              )}
            </button>

            {showAnonLog && isAnonymized && (
              <AnonymizationLogPanel log={interview.anonymization_log} />
            )}
          </div>

          {/* Unsaved changes warning */}
          {hasUnsavedChanges && (
            <div
              style={{
                background: COLORS.warningBg,
                border: `1px solid #FDE68A`,
                borderRadius: "6px",
                padding: "8px 12px",
                marginBottom: "12px",
                fontSize: "12px",
                color: COLORS.warningText,
              }}
            >
              Unsaved changes. Save to update the analysis status.
            </div>
          )}

          {/* Text content */}
          {isEditing ? (
            <textarea
              value={editedText}
              onChange={handleTextChange}
              style={{
                width: "100%",
                boxSizing: "border-box",
                minHeight: "400px",
                border: `1px solid ${COLORS.accent}`,
                borderRadius: "6px",
                padding: "12px",
                fontSize: "13px",
                color: COLORS.text,
                lineHeight: "1.7",
                fontFamily: SHARED_FONT,
                resize: "vertical",
                outline: "none",
                background: COLORS.white,
              }}
            />
          ) : (
            <div
              style={{
                fontSize: "13px",
                color: COLORS.text,
                lineHeight: "1.8",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {displayText ?? (
                <span style={{ color: COLORS.textMuted, fontStyle: "italic" }}>
                  No content added yet.
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Right panel: Analysis Output ── */}
        <div
          style={{
            overflowY: "auto",
            padding: "32px 36px",
            background: COLORS.bg,
          }}
        >
          {/* Panel header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "24px",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: COLORS.textSecondary,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  margin: "0 0 6px 0",
                }}
              >
                Analysis Output
              </h2>
              {interview.date_analyzed && hasAnalysis && (
                <p
                  style={{
                    fontSize: "12px",
                    color: COLORS.textMuted,
                    margin: 0,
                  }}
                >
                  Analyzed {formatDate(interview.date_analyzed)}
                </p>
              )}
            </div>

            {/* Re-analyze button for outdated status */}
            {isOutdated && !analyzing && (
              <PrimaryButton onClick={handleRunAnalysis}>
                Re-analyze
              </PrimaryButton>
            )}
          </div>

          {/* Outdated banner */}
          {isOutdated && (
            <div
              style={{
                background: COLORS.warningBg,
                border: `1px solid #FDE68A`,
                borderRadius: "6px",
                padding: "10px 14px",
                marginBottom: "20px",
                fontSize: "13px",
                color: COLORS.warningText,
              }}
            >
              Your notes have changed. Re-analyze to update.
            </div>
          )}

          {/* Analysis error */}
          {analysisError && (
            <div
              style={{
                background: COLORS.errorBg,
                border: `1px solid #FCA5A5`,
                borderRadius: "6px",
                padding: "10px 14px",
                marginBottom: "20px",
                fontSize: "13px",
                color: COLORS.errorText,
              }}
            >
              {analysisError}
            </div>
          )}

          {/* Analyzing loading state */}
          {analyzing && (
            <div
              style={{
                padding: "48px 0",
                textAlign: "center",
                color: COLORS.textSecondary,
              }}
            >
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  border: `3px solid ${COLORS.accentLight}`,
                  borderTopColor: COLORS.accent,
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  margin: "0 auto 16px",
                }}
              />
              <p style={{ fontSize: "14px", margin: 0 }}>
                Analyzing your interview. This takes about 10–20 seconds.
              </p>
            </div>
          )}

          {/* Not yet analyzed state */}
          {!analyzing && interview.analysis_status === "not_run" && (
            <div
              style={{
                textAlign: "center",
                padding: "48px 24px",
                color: COLORS.textSecondary,
              }}
            >
              <p
                style={{
                  fontSize: "15px",
                  fontWeight: 500,
                  color: COLORS.text,
                  marginBottom: "8px",
                }}
              >
                Analysis not yet run
              </p>
              <p style={{ fontSize: "14px", marginBottom: "24px" }}>
                Run analysis to see the 7-bucket breakdown.
              </p>
              <PrimaryButton onClick={handleRunAnalysis}>
                Analyze interview
              </PrimaryButton>
            </div>
          )}

          {/* Analysis output */}
          {!analyzing && hasAnalysis && interview.stage1_output && (
            <div>
              {BUCKET_CONFIG.map(({ key, label }) => (
                <BucketSection
                  key={key}
                  bucketKey={key}
                  label={label}
                  value={interview.stage1_output[key]}
                />
              ))}
            </div>
          )}

          {/* Edge case: complete status but no output stored */}
          {!analyzing && hasAnalysis && !interview.stage1_output && (
            <div
              style={{
                textAlign: "center",
                padding: "48px 24px",
                color: COLORS.textSecondary,
              }}
            >
              <p style={{ fontSize: "14px" }}>
                Analysis output could not be loaded. Try re-analyzing.
              </p>
              <PrimaryButton
                onClick={handleRunAnalysis}
                style={{ marginTop: "16px" }}
              >
                Re-analyze
              </PrimaryButton>
            </div>
          )}
        </div>
      </div>

      {/* How It Works modal */}
      {showHowItWorksModal && (
        <HowItWorksModal onClose={() => setShowHowItWorksModal(false)} />
      )}
    </div>
  );
}
