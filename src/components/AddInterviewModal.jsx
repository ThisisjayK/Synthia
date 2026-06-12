// src/components/AddInterviewModal.jsx
// Multi-phase modal for adding and analyzing an interview.
//
// Phases:
//   'form'          - user fills in fields and pastes content
//   'saving'        - record being written to Supabase before any API call
//   'stage0'        - Stage 0 anonymization running
//   'stage0_error'  - Stage 0 failed: show recovery panel (Retry / Analyze without anonymizing)
//   'review'        - Anonymization Review Panel (human checkpoint)
//   'confirming'    - "analyze without anonymizing" inline confirmation shown
//   'stage1'        - Stage 1 analysis running
//   'done'          - analysis complete, modal closes via onSuccess
//
// On success: calls onSuccess(newInterview) so ProjectView can append the card.
// On cancel: calls onClose().
//
// PRD references: Section 9.5, 9.5a, 10.1, 13.4

import { useState } from "react";
import { supabase } from "../supabaseClient";
import { runStage0 } from "../api/stage0";
import { runStage1 } from "../api/stage1";

// ─── Constants ────────────────────────────────────────────────────────────────

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
  errorText: "#DC2626",
  errorBg: "#FEF2F2",
  warningText: "#92400E",
  warningBg: "#FEF3C7",
  infoBg: "#EFF6FF",
  infoText: "#1E40AF",
  successText: "#166534",
  successBg: "#DCFCE7",
};

const SHARED_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const WORD_COUNT_WARNING = 150;

// DB value => display label mappings to match Supabase check constraints exactly.
const INPUT_TYPES = [
  { value: "manual", label: "Manual Notes" },
  { value: "ai_notes", label: "AI Note-Taker Output" },
  { value: "transcript", label: "Full Transcript" },
];

const METHODS = [
  { value: "remote_call", label: "Remote Call" },
  { value: "in_person", label: "In-Person" },
  { value: "async_written", label: "Async Written" },
];

// ─── Small shared components ──────────────────────────────────────────────────

function FieldLabel({ htmlFor, children, optional = false }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block",
        fontSize: "13px",
        fontWeight: 500,
        color: COLORS.text,
        marginBottom: "6px",
      }}
    >
      {children}
      {optional && (
        <span
          style={{
            fontSize: "12px",
            color: COLORS.textMuted,
            fontWeight: 400,
            marginLeft: "6px",
          }}
        >
          optional
        </span>
      )}
    </label>
  );
}

function CharCount({ current, max }) {
  const near = current > max * 0.85;
  const over = current > max;
  return (
    <span
      style={{
        fontSize: "11px",
        color: over ? COLORS.errorText : near ? "#D97706" : COLORS.textMuted,
        float: "right",
      }}
    >
      {current}/{max}
    </span>
  );
}

function TextInput({ id, value, onChange, maxLength, placeholder, hasError }) {
  return (
    <input
      id={id}
      type="text"
      value={value}
      onChange={onChange}
      maxLength={maxLength}
      placeholder={placeholder}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: `1px solid ${hasError ? COLORS.errorText : COLORS.border}`,
        borderRadius: "6px",
        padding: "9px 12px",
        fontSize: "14px",
        color: COLORS.text,
        background: COLORS.white,
        outline: "none",
        fontFamily: SHARED_FONT,
        transition: "border-color 0.15s ease",
      }}
      onFocus={(e) => {
        if (!hasError) e.currentTarget.style.borderColor = COLORS.accent;
      }}
      onBlur={(e) => {
        if (!hasError) e.currentTarget.style.borderColor = COLORS.border;
      }}
    />
  );
}

function SelectInput({ id, value, onChange, children }) {
  return (
    <select
      id={id}
      value={value}
      onChange={onChange}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: `1px solid ${COLORS.border}`,
        borderRadius: "6px",
        padding: "9px 12px",
        fontSize: "14px",
        color: value ? COLORS.text : COLORS.textMuted,
        background: COLORS.white,
        outline: "none",
        fontFamily: SHARED_FONT,
        cursor: "pointer",
        appearance: "none",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2394A3B8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 12px center",
        paddingRight: "32px",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
      onBlur={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
    >
      {children}
    </select>
  );
}

function InlineError({ message }) {
  if (!message) return null;
  return (
    <p
      style={{
        fontSize: "12px",
        color: COLORS.errorText,
        marginTop: "5px",
        marginBottom: 0,
      }}
    >
      {message}
    </p>
  );
}

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
        padding: "9px 20px",
        fontSize: "14px",
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
        padding: "9px 20px",
        fontSize: "14px",
        fontWeight: 500,
        color: COLORS.textSecondary,
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

function TextLinkButton({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "none",
        border: "none",
        color: disabled ? COLORS.textMuted : COLORS.textSecondary,
        fontSize: "13px",
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "9px 4px",
        fontFamily: SHARED_FONT,
        textDecoration: "underline",
        textUnderlineOffset: "2px",
      }}
    >
      {children}
    </button>
  );
}

// ─── Loading spinner (inline) ─────────────────────────────────────────────────

function LoadingPanel({ message }) {
  return (
    <div
      style={{
        padding: "40px 0",
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
      <p style={{ fontSize: "14px", margin: 0 }}>{message}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Anonymization Review Panel ───────────────────────────────────────────────
// PRD Section 9.5a: mandatory human checkpoint after Stage 0.

function AnonymizationReviewPanel({
  anonymizationLog,
  anonymizedText,
  onConfirm,
  onGoBack,
  loading,
  error,
}) {
  const [showPreview, setShowPreview] = useState(false);
  const hasSubstitutions =
    anonymizationLog && anonymizationLog.trim() !== "NONE";
  const logLines = hasSubstitutions
    ? anonymizationLog.split("\n").filter((l) => l.trim())
    : [];

  return (
    <div>
      <h3
        style={{
          fontSize: "15px",
          fontWeight: 600,
          color: COLORS.text,
          margin: "0 0 6px 0",
        }}
      >
        Review anonymization before analysis
      </h3>
      <p
        style={{
          fontSize: "13px",
          color: COLORS.textSecondary,
          margin: "0 0 20px 0",
          lineHeight: "1.5",
        }}
      >
        We found and replaced the following personal information. Review the
        changes, then confirm to proceed with analysis.
      </p>

      {/* Substitution log */}
      <div
        style={{
          background: COLORS.bg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: "6px",
          padding: "12px 16px",
          marginBottom: "16px",
          maxHeight: "160px",
          overflowY: "auto",
        }}
      >
        {hasSubstitutions ? (
          logLines.map((line, i) => (
            <p
              key={i}
              style={{
                fontSize: "13px",
                color: COLORS.text,
                margin: "0 0 4px 0",
                fontFamily: "monospace",
              }}
            >
              {line}
            </p>
          ))
        ) : (
          <p
            style={{
              fontSize: "13px",
              color: COLORS.textSecondary,
              margin: 0,
            }}
          >
            No personal information detected. You can still proceed to analysis.
          </p>
        )}
      </div>

      {/* Anonymized text preview (collapsible) */}
      <div style={{ marginBottom: "16px" }}>
        <button
          onClick={() => setShowPreview((v) => !v)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: "13px",
            color: COLORS.accent,
            padding: 0,
            fontFamily: SHARED_FONT,
          }}
        >
          {showPreview ? "▲ Hide" : "▼ Show"} anonymized text preview
        </button>
        {showPreview && (
          <div
            style={{
              marginTop: "10px",
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              borderRadius: "6px",
              padding: "12px 16px",
              maxHeight: "180px",
              overflowY: "auto",
              fontSize: "13px",
              color: COLORS.text,
              lineHeight: "1.6",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {anonymizedText}
          </div>
        )}
      </div>

      {/* Warning note per PRD Section 9.5a */}
      <div
        style={{
          background: COLORS.warningBg,
          border: `1px solid #FDE68A`,
          borderRadius: "6px",
          padding: "10px 14px",
          marginBottom: "20px",
          fontSize: "12px",
          color: COLORS.warningText,
          lineHeight: "1.5",
        }}
      >
        Anonymization is AI-assisted and may not catch all personal information,
        particularly indirect identifiers. Please review before confirming.
      </div>

      {/* API error */}
      {error && (
        <div
          style={{
            background: COLORS.errorBg,
            border: `1px solid #FCA5A5`,
            borderRadius: "6px",
            padding: "10px 14px",
            marginBottom: "16px",
            fontSize: "13px",
            color: COLORS.errorText,
          }}
        >
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
        <GhostButton onClick={onGoBack} disabled={loading}>
          Go back
        </GhostButton>
        <PrimaryButton onClick={onConfirm} loading={loading}>
          {loading ? "Analyzing..." : "Confirm and analyze"}
        </PrimaryButton>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AddInterviewModal({ projectId, onClose, onSuccess }) {
  // Form fields
  const [label, setLabel] = useState("");
  const [inputType, setInputType] = useState("");
  const [segmentTag, setSegmentTag] = useState("");
  const [dateConducted, setDateConducted] = useState("");
  const [interviewerName, setInterviewerName] = useState("");
  const [method, setMethod] = useState("");
  const [rawText, setRawText] = useState("");

  // Phase state machine
  const [phase, setPhase] = useState("form");

  // Validation errors
  const [labelError, setLabelError] = useState(null);
  const [inputTypeError, setInputTypeError] = useState(null);
  const [rawTextError, setRawTextError] = useState(null);

  // API / save errors
  const [apiError, setApiError] = useState(null);

  // Stage 0 review data
  const [anonymizationLog, setAnonymizationLog] = useState(null);
  const [anonymizedText, setAnonymizedText] = useState(null);

  // The Supabase record ID created after the initial save.
  // Needed for Stage 0 and Stage 1 calls.
  const [savedInterviewId, setSavedInterviewId] = useState(null);

  // ── Derived ──
  const wordCount = rawText.trim() ? rawText.trim().split(/\s+/).length : 0;
  const showWordCountWarning = wordCount > 0 && wordCount < WORD_COUNT_WARNING;
  const isBusy = phase === "saving" || phase === "stage0" || phase === "stage1";

  // ── Validation ──
  function validate() {
    let valid = true;
    if (!label.trim()) {
      setLabelError("Interview label is required.");
      valid = false;
    } else {
      setLabelError(null);
    }
    if (!inputType) {
      setInputTypeError("Please select an input type.");
      valid = false;
    } else {
      setInputTypeError(null);
    }
    if (!rawText.trim()) {
      setRawTextError("Please paste your interview content before analyzing.");
      valid = false;
    } else {
      setRawTextError(null);
    }
    return valid;
  }

  function validateForSave() {
    let valid = true;
    if (!label.trim()) {
      setLabelError("Interview label is required.");
      valid = false;
    } else {
      setLabelError(null);
    }
    if (!inputType) {
      setInputTypeError("Please select an input type.");
      valid = false;
    } else {
      setInputTypeError(null);
    }
    // rawText not required for save-only
    setRawTextError(null);
    return valid;
  }

  // ── Save record to Supabase ──
  // Called before any API call. Returns the new interview ID.
  // Sequential async: Stage 0/1 must not start until this resolves.
  async function saveRecord() {
    setPhase("saving");
    setApiError(null);

    const { data, error } = await supabase
      .from("interviews")
      .insert({
        project_id: projectId,
        label: label.trim(),
        input_type: inputType,
        segment_tag: segmentTag.trim() || null,
        date_conducted: dateConducted || null,
        interviewer_name: interviewerName.trim() || null,
        method: method || null,
        raw_input_text: rawText.trim(),
        word_count: wordCount,
        anonymization_status: "not_run",
        analysis_status: "not_run",
      })
      .select("id")
      .single();

    if (error) {
      setApiError(
        "Could not save interview. Check your connection and try again.",
      );
      setPhase("form");
      return null;
    }

    setSavedInterviewId(data.id);
    return data.id;
  }

  // ── Path: Anonymize and Analyze ──
  async function handleAnonymizeAndAnalyze() {
    if (!validate()) return;

    const interviewId = await saveRecord();
    if (!interviewId) return;

    // Stage 0
    setPhase("stage0");
    setApiError(null);

    try {
      const { anonymizedText: aText, anonymizationLog: aLog } = await runStage0(
        { interviewId, rawText: rawText.trim() },
      );
      setAnonymizedText(aText);
      setAnonymizationLog(aLog);
      setPhase("review");
    } catch (err) {
      // Per PRD Section 10.1: on Stage 0 failure, show a dedicated recovery
      // panel with two explicit options. Never silently send raw text to Stage 1.
      setApiError(
        err.message ??
          "Anonymization failed. You can try again, or analyze without anonymizing.",
      );
      setPhase("stage0_error");
    }
  }

  // ── Path: Confirm after review panel ──
  async function handleConfirmAndAnalyze() {
    setApiError(null);
    // Phase stays 'review' but shows loading state inside the panel.
    // Switch to stage1 so the panel shows "Analyzing..."
    setPhase("stage1");

    try {
      await runStage1({ interviewId: savedInterviewId });
      // Fetch the full updated record to pass back to ProjectView.
      const { data } = await supabase
        .from("interviews")
        .select(
          "id, label, input_type, segment_tag, date_conducted, analysis_status, date_analyzed",
        )
        .eq("id", savedInterviewId)
        .single();
      onSuccess(data);
    } catch (err) {
      setApiError(
        err.message ??
          "Analysis failed. This is usually temporary. Please try again.",
      );
      // Return to review panel so user can retry.
      setPhase("review");
    }
  }

  // ── Path: Retry Stage 0 after failure ──
  // Re-runs anonymization using the already-saved record.
  async function handleRetryStage0() {
    setApiError(null);
    setPhase("stage0");

    try {
      const { anonymizedText: aText, anonymizationLog: aLog } = await runStage0(
        { interviewId: savedInterviewId, rawText: rawText.trim() },
      );
      setAnonymizedText(aText);
      setAnonymizationLog(aLog);
      setPhase("review");
    } catch (err) {
      setApiError(
        err.message ??
          "Anonymization failed. You can try again, or analyze without anonymizing.",
      );
      setPhase("stage0_error");
    }
  }

  // ── Path: Skip to Stage 1 from stage0_error recovery panel ──
  // User explicitly chooses to proceed without anonymizing after Stage 0 failed.
  async function handleSkipAnonymizationAfterError() {
    setApiError(null);
    setPhase("stage1");

    try {
      await runStage1({ interviewId: savedInterviewId });
      const { data } = await supabase
        .from("interviews")
        .select(
          "id, label, input_type, segment_tag, date_conducted, analysis_status, date_analyzed",
        )
        .eq("id", savedInterviewId)
        .single();
      onSuccess(data);
    } catch (err) {
      setApiError(
        err.message ??
          "Analysis failed. This is usually temporary. Please try again.",
      );
      setPhase("stage0_error");
    }
  }

  // ── Path: Analyze Without Anonymizing ──
  function handleAnalyzeWithoutAnonymizing() {
    if (!validate()) return;
    setPhase("confirming");
  }

  async function handleConfirmNoAnon() {
    const interviewId = await saveRecord();
    if (!interviewId) return;

    setPhase("stage1");
    setApiError(null);

    try {
      await runStage1({ interviewId });
      const { data } = await supabase
        .from("interviews")
        .select(
          "id, label, input_type, segment_tag, date_conducted, analysis_status, date_analyzed",
        )
        .eq("id", interviewId)
        .single();
      onSuccess(data);
    } catch (err) {
      setApiError(
        err.message ??
          "Analysis failed. This is usually temporary. Please try again.",
      );
      setPhase("form");
    }
  }

  // ── Path: Save Without Analyzing ──
  async function handleSaveOnly() {
    if (!validateForSave()) return;
    // rawText can be empty for save-only per PRD Section 9.5.
    // But if there's no raw text, word_count is 0 which is fine.

    setPhase("saving");
    setApiError(null);

    const { data, error } = await supabase
      .from("interviews")
      .insert({
        project_id: projectId,
        label: label.trim(),
        input_type: inputType || null,
        segment_tag: segmentTag.trim() || null,
        date_conducted: dateConducted || null,
        interviewer_name: interviewerName.trim() || null,
        method: method || null,
        raw_input_text: rawText.trim() || null,
        word_count: wordCount,
        anonymization_status: "not_run",
        analysis_status: "not_run",
      })
      .select(
        "id, label, input_type, segment_tag, date_conducted, analysis_status, date_analyzed",
      )
      .single();

    if (error) {
      setApiError(
        "Could not save interview. Check your connection and try again.",
      );
      setPhase("form");
      return;
    }

    onSuccess(data);
  }

  // ── Backdrop click ──
  function handleBackdropClick(e) {
    if (e.target === e.currentTarget && !isBusy) onClose();
  }

  // ── Render helpers ──

  const formDisabled = isBusy;

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "24px",
        fontFamily: SHARED_FONT,
      }}
    >
      <div
        style={{
          background: COLORS.white,
          borderRadius: "10px",
          width: "100%",
          maxWidth: "560px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "32px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}
      >
        {/* ── Header ── */}
        {phase !== "review" && phase !== "stage0_error" && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "24px",
            }}
          >
            <h2
              style={{
                fontSize: "17px",
                fontWeight: 600,
                color: COLORS.text,
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              {phase === "stage0"
                ? "Scanning for personal information..."
                : phase === "stage1"
                  ? "Analyzing interview..."
                  : "Add Interview"}
            </h2>
            {!isBusy && (
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: COLORS.textMuted,
                  fontSize: "20px",
                  lineHeight: 1,
                  padding: "2px 4px",
                }}
                aria-label="Close"
              >
                ×
              </button>
            )}
          </div>
        )}

        {/* ── Phase: stage0 loading ── */}
        {phase === "stage0" && (
          <LoadingPanel message="Scanning for personal information. This takes a few seconds." />
        )}

        {/* ── Phase: stage1 loading ── */}
        {phase === "stage1" && (
          <LoadingPanel message="Analyzing your interview. This takes about 10–20 seconds." />
        )}

        {/* ── Phase: saving loading ── */}
        {phase === "saving" && <LoadingPanel message="Saving..." />}

        {/* ── Phase: stage0_error — explicit recovery panel ── */}
        {/* PRD Section 10.1: two named options, user is never silently sent to Stage 1 */}
        {phase === "stage0_error" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
              }}
            >
              <h2
                style={{
                  fontSize: "17px",
                  fontWeight: 600,
                  color: COLORS.text,
                  margin: 0,
                  letterSpacing: "-0.01em",
                }}
              >
                Anonymization failed
              </h2>
              <button
                onClick={onClose}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: COLORS.textMuted,
                  fontSize: "20px",
                  lineHeight: 1,
                  padding: "2px 4px",
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div
              style={{
                background: COLORS.errorBg,
                border: `1px solid #FCA5A5`,
                borderRadius: "6px",
                padding: "12px 14px",
                marginBottom: "24px",
                fontSize: "13px",
                color: COLORS.errorText,
                lineHeight: "1.5",
              }}
            >
              {apiError ??
                "Anonymization failed. You can try again, or proceed to analyze without anonymizing."}
            </div>

            <p
              style={{
                fontSize: "13px",
                color: COLORS.textSecondary,
                marginBottom: "20px",
                lineHeight: "1.5",
              }}
            >
              How would you like to proceed?
            </p>

            <div
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
              <PrimaryButton
                onClick={handleRetryStage0}
                style={{ width: "100%" }}
              >
                Retry anonymization
              </PrimaryButton>
              <GhostButton
                onClick={handleSkipAnonymizationAfterError}
                style={{ width: "100%" }}
              >
                Analyze without anonymizing
              </GhostButton>
              <button
                onClick={() => {
                  setPhase("form");
                  setApiError(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "13px",
                  color: COLORS.textMuted,
                  padding: "6px 0",
                  textAlign: "center",
                  textDecoration: "underline",
                  textUnderlineOffset: "2px",
                }}
              >
                Go back to form
              </button>
            </div>
          </div>
        )}

        {/* ── Phase: review (Anonymization Review Panel) ── */}
        {phase === "review" && (
          <AnonymizationReviewPanel
            anonymizationLog={anonymizationLog}
            anonymizedText={anonymizedText}
            onConfirm={handleConfirmAndAnalyze}
            onGoBack={() => {
              setPhase("form");
              setApiError(null);
            }}
            loading={false}
            error={apiError}
          />
        )}

        {/* ── Phase: form (and confirming overlay) ── */}
        {(phase === "form" || phase === "confirming") && (
          <>
            {/* Global API error banner */}
            {apiError && (
              <div
                style={{
                  background: COLORS.errorBg,
                  border: `1px solid #FCA5A5`,
                  borderRadius: "6px",
                  padding: "10px 14px",
                  marginBottom: "20px",
                  fontSize: "13px",
                  color: COLORS.errorText,
                  lineHeight: "1.5",
                }}
              >
                {apiError}
              </div>
            )}

            {/* Interview Label */}
            <div style={{ marginBottom: "18px" }}>
              <FieldLabel htmlFor="iv-label">
                Interview label{" "}
                <span style={{ color: COLORS.errorText }}>*</span>
              </FieldLabel>
              <CharCount current={label.length} max={80} />
              <TextInput
                id="iv-label"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  if (labelError) setLabelError(null);
                }}
                maxLength={80}
                placeholder="e.g. Interview 5 - Sarah - Nov 2024"
                hasError={!!labelError}
              />
              <InlineError message={labelError} />
            </div>

            {/* Input Type */}
            <div style={{ marginBottom: "18px" }}>
              <FieldLabel htmlFor="iv-input-type">
                Input type <span style={{ color: COLORS.errorText }}>*</span>
              </FieldLabel>
              <SelectInput
                id="iv-input-type"
                value={inputType}
                onChange={(e) => {
                  setInputType(e.target.value);
                  if (inputTypeError) setInputTypeError(null);
                }}
              >
                <option value="">Select input type...</option>
                {INPUT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </SelectInput>
              <InlineError message={inputTypeError} />
            </div>

            {/* Two-column optional fields */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "14px",
                marginBottom: "18px",
              }}
            >
              <div>
                <FieldLabel htmlFor="iv-segment" optional>
                  Segment tag
                </FieldLabel>
                <TextInput
                  id="iv-segment"
                  value={segmentTag}
                  onChange={(e) => setSegmentTag(e.target.value)}
                  maxLength={50}
                  placeholder="e.g. Enterprise, Nurse"
                />
              </div>
              <div>
                <FieldLabel htmlFor="iv-date" optional>
                  Date conducted
                </FieldLabel>
                <input
                  id="iv-date"
                  type="date"
                  value={dateConducted}
                  onChange={(e) => setDateConducted(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: "6px",
                    padding: "9px 12px",
                    fontSize: "14px",
                    color: dateConducted ? COLORS.text : COLORS.textMuted,
                    background: COLORS.white,
                    outline: "none",
                    fontFamily: SHARED_FONT,
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = COLORS.accent)
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = COLORS.border)
                  }
                />
              </div>
              <div>
                <FieldLabel htmlFor="iv-interviewer" optional>
                  Interviewer
                </FieldLabel>
                <TextInput
                  id="iv-interviewer"
                  value={interviewerName}
                  onChange={(e) => setInterviewerName(e.target.value)}
                  maxLength={60}
                  placeholder="Name"
                />
              </div>
              <div>
                <FieldLabel htmlFor="iv-method" optional>
                  Method
                </FieldLabel>
                <SelectInput
                  id="iv-method"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="">Select...</option>
                  {METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </SelectInput>
              </div>
            </div>

            {/* Raw interview content */}
            <div style={{ marginBottom: "6px" }}>
              <FieldLabel htmlFor="iv-content">
                Interview content{" "}
                <span style={{ color: COLORS.errorText }}>*</span>
              </FieldLabel>
              <div
                style={{
                  fontSize: "11px",
                  color: COLORS.textMuted,
                  float: "right",
                  marginBottom: "6px",
                }}
              >
                {wordCount} words
              </div>
              <textarea
                id="iv-content"
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  if (rawTextError) setRawTextError(null);
                }}
                placeholder="Paste your notes, AI note-taker output, or transcript here..."
                rows={8}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: `1px solid ${rawTextError ? COLORS.errorText : COLORS.border}`,
                  borderRadius: "6px",
                  padding: "10px 12px",
                  fontSize: "13px",
                  color: COLORS.text,
                  background: COLORS.white,
                  outline: "none",
                  resize: "vertical",
                  fontFamily: SHARED_FONT,
                  lineHeight: "1.6",
                  transition: "border-color 0.15s ease",
                }}
                onFocus={(e) => {
                  if (!rawTextError)
                    e.currentTarget.style.borderColor = COLORS.accent;
                }}
                onBlur={(e) => {
                  if (!rawTextError)
                    e.currentTarget.style.borderColor = COLORS.border;
                }}
              />
              <InlineError message={rawTextError} />
            </div>

            {/* Word count warning */}
            {showWordCountWarning && (
              <div
                style={{
                  background: COLORS.warningBg,
                  border: `1px solid #FDE68A`,
                  borderRadius: "6px",
                  padding: "8px 12px",
                  marginBottom: "16px",
                  fontSize: "12px",
                  color: COLORS.warningText,
                }}
              >
                These notes are brief (under {WORD_COUNT_WARNING} words).
                Analysis may be incomplete. You can still proceed.
              </div>
            )}

            {/* Long input note */}
            {wordCount > 5000 && (
              <div
                style={{
                  background: COLORS.infoBg,
                  border: `1px solid #BFDBFE`,
                  borderRadius: "6px",
                  padding: "8px 12px",
                  marginBottom: "16px",
                  fontSize: "12px",
                  color: COLORS.infoText,
                }}
              >
                Long input detected. Analysis may take up to 30 seconds.
              </div>
            )}

            {/* Privacy notice per PRD Section 9.5 and 13.6 */}
            <div
              style={{
                background: COLORS.infoBg,
                border: `1px solid #BFDBFE`,
                borderRadius: "6px",
                padding: "10px 14px",
                marginBottom: "20px",
                fontSize: "12px",
                color: COLORS.infoText,
                lineHeight: "1.5",
              }}
            >
              Interview content will be sent to the Claude API for analysis. Use
              the Anonymize option to remove names and organizations before
              sending.
            </div>

            {/* Analyze without anonymizing: inline confirmation */}
            {phase === "confirming" && (
              <div
                style={{
                  background: COLORS.warningBg,
                  border: `1px solid #FDE68A`,
                  borderRadius: "6px",
                  padding: "12px 14px",
                  marginBottom: "16px",
                  fontSize: "13px",
                  color: COLORS.warningText,
                  lineHeight: "1.5",
                }}
              >
                <p style={{ margin: "0 0 10px 0" }}>
                  Your notes will be sent to the Claude API without
                  anonymization. Proceed?
                </p>
                <div style={{ display: "flex", gap: "10px" }}>
                  <PrimaryButton
                    onClick={handleConfirmNoAnon}
                    style={{ fontSize: "13px", padding: "7px 16px" }}
                  >
                    Confirm
                  </PrimaryButton>
                  <GhostButton
                    onClick={() => setPhase("form")}
                    style={{ fontSize: "13px", padding: "7px 16px" }}
                  >
                    Cancel
                  </GhostButton>
                </div>
              </div>
            )}

            {/* CTAs */}
            {phase !== "confirming" && (
              <div>
                {/* Primary CTA row */}
                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    marginBottom: "12px",
                    alignItems: "center",
                  }}
                >
                  <PrimaryButton
                    onClick={handleAnonymizeAndAnalyze}
                    disabled={formDisabled}
                    style={{ flex: 1 }}
                  >
                    Anonymize and analyze
                  </PrimaryButton>
                  <GhostButton
                    onClick={handleAnalyzeWithoutAnonymizing}
                    disabled={formDisabled}
                    style={{ flex: 1 }}
                  >
                    Analyze without anonymizing
                  </GhostButton>
                </div>

                {/* Secondary CTA row */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <TextLinkButton
                    onClick={handleSaveOnly}
                    disabled={formDisabled}
                  >
                    Save without analyzing
                  </TextLinkButton>
                  <TextLinkButton onClick={onClose} disabled={formDisabled}>
                    Cancel
                  </TextLinkButton>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
