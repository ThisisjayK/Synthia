// src/components/NewProjectModal.jsx
// Modal for creating a new project.
// Fields per PRD Section 9.3:
//   - Project Name (required, max 80 chars)
//   - Product Description (optional, max 500 chars)
//   - Target User Type (optional, max 100 chars)
//   - Domain / Industry (optional, max 100 chars)
//
// On success: calls onSuccess(newProject) so Home can append the card
// and navigate to the new project without a full refetch.
// On cancel: calls onClose().

import { useState } from "react";
import { supabase } from "../supabaseClient";

// ─── Field components ────────────────────────────────────────────────────────

function Label({ htmlFor, children }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "block",
        fontSize: "13px",
        fontWeight: 500,
        color: "#1A1A1A",
        marginBottom: "6px",
      }}
    >
      {children}
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
        color: over ? "#DC2626" : near ? "#D97706" : "#94A3B8",
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
        border: `1px solid ${hasError ? "#DC2626" : "#E2E1DF"}`,
        borderRadius: "6px",
        padding: "9px 12px",
        fontSize: "14px",
        color: "#1A1A1A",
        background: "#FFFFFF",
        outline: "none",
        transition: "border-color 0.15s ease",
        fontFamily: "inherit",
      }}
      onFocus={(e) =>
        !hasError && (e.currentTarget.style.borderColor = "#5B50E8")
      }
      onBlur={(e) =>
        !hasError && (e.currentTarget.style.borderColor = "#E2E1DF")
      }
    />
  );
}

function TextArea({ id, value, onChange, maxLength, placeholder, rows = 3 }) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={onChange}
      maxLength={maxLength}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #E2E1DF",
        borderRadius: "6px",
        padding: "9px 12px",
        fontSize: "14px",
        color: "#1A1A1A",
        background: "#FFFFFF",
        outline: "none",
        resize: "vertical",
        transition: "border-color 0.15s ease",
        fontFamily: "inherit",
        lineHeight: "1.5",
      }}
      onFocus={(e) => (e.currentTarget.style.borderColor = "#5B50E8")}
      onBlur={(e) => (e.currentTarget.style.borderColor = "#E2E1DF")}
    />
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function NewProjectModal({ onClose, onSuccess }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetUserType, setTargetUserType] = useState("");
  const [domain, setDomain] = useState("");
  const [nameError, setNameError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [saving, setSaving] = useState(false);

  function validate() {
    if (!name.trim()) {
      setNameError("Project name is required.");
      return false;
    }
    if (name.trim().length > 80) {
      setNameError("Project name must be 80 characters or fewer.");
      return false;
    }
    setNameError(null);
    return true;
  }

  async function handleSubmit() {
    if (!validate()) return;

    setSaving(true);
    setSubmitError(null);

    const { data, error } = await supabase
      .from("projects")
      .insert({
        name: name.trim(),
        product_description: description.trim() || null,
        target_user_type: targetUserType.trim() || null,
        domain: domain.trim() || null,
        is_demo: false,
      })
      .select()
      .single();

    setSaving(false);

    if (error) {
      // PRD Section 10.1: duplicate project name error
      if (
        error.message?.toLowerCase().includes("unique") ||
        error.message?.toLowerCase().includes("duplicate")
      ) {
        setNameError(
          "A project with this name already exists. Choose a different name.",
        );
      } else {
        setSubmitError(
          "Could not create project. Check your connection and try again.",
        );
      }
      return;
    }

    onSuccess(data);
  }

  function handleBackdropClick(e) {
    // Close only if the click is directly on the backdrop, not the modal panel.
    if (e.target === e.currentTarget) onClose();
  }

  return (
    // Backdrop
    <div
      onClick={handleBackdropClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "24px",
      }}
    >
      {/* Modal panel */}
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "10px",
          width: "100%",
          maxWidth: "480px",
          padding: "32px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "28px",
          }}
        >
          <h2
            style={{
              fontSize: "17px",
              fontWeight: 600,
              color: "#1A1A1A",
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            New Project
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#94A3B8",
              fontSize: "20px",
              lineHeight: 1,
              padding: "2px 4px",
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Project Name */}
        <div style={{ marginBottom: "20px" }}>
          <Label htmlFor="project-name">
            Project name <span style={{ color: "#DC2626" }}>*</span>
          </Label>
          <CharCount current={name.length} max={80} />
          <TextInput
            id="project-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError(null);
            }}
            maxLength={80}
            placeholder="e.g. Hospital Scheduling App - Discovery"
            hasError={!!nameError}
          />
          {nameError && (
            <p
              style={{
                fontSize: "12px",
                color: "#DC2626",
                marginTop: "5px",
                marginBottom: 0,
              }}
            >
              {nameError}
            </p>
          )}
        </div>

        {/* Product Description */}
        <div style={{ marginBottom: "20px" }}>
          <Label htmlFor="product-description">
            Product description{" "}
            <span
              style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 400 }}
            >
              optional
            </span>
          </Label>
          <CharCount current={description.length} max={500} />
          <TextArea
            id="product-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            placeholder="What does this product do and who is it for?"
            rows={3}
          />
        </div>

        {/* Target User Type */}
        <div style={{ marginBottom: "20px" }}>
          <Label htmlFor="target-user">
            Target user type{" "}
            <span
              style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 400 }}
            >
              optional
            </span>
          </Label>
          <CharCount current={targetUserType.length} max={100} />
          <TextInput
            id="target-user"
            value={targetUserType}
            onChange={(e) => setTargetUserType(e.target.value)}
            maxLength={100}
            placeholder="e.g. ICU nurses, SMB accountants, first-time homebuyers"
          />
        </div>

        {/* Domain / Industry */}
        <div style={{ marginBottom: "28px" }}>
          <Label htmlFor="domain">
            Domain / industry{" "}
            <span
              style={{ fontSize: "12px", color: "#94A3B8", fontWeight: 400 }}
            >
              optional
            </span>
          </Label>
          <CharCount current={domain.length} max={100} />
          <TextInput
            id="domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            maxLength={100}
            placeholder="e.g. B2B healthcare SaaS, consumer finance app"
          />
        </div>

        {/* Submit error */}
        {submitError && (
          <p
            style={{
              fontSize: "13px",
              color: "#DC2626",
              marginBottom: "16px",
              marginTop: "-12px",
              background: "#FEF2F2",
              padding: "10px 12px",
              borderRadius: "6px",
            }}
          >
            {submitError}
          </p>
        )}

        {/* Actions */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "12px",
          }}
        >
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              background: "none",
              border: "none",
              color: "#64748B",
              fontSize: "14px",
              fontWeight: 500,
              cursor: saving ? "not-allowed" : "pointer",
              padding: "9px 16px",
              borderRadius: "6px",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            style={{
              background: saving ? "#A5A0F0" : "#5B50E8",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "6px",
              padding: "9px 20px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: saving ? "not-allowed" : "pointer",
              transition: "background 0.15s ease",
              minWidth: "120px",
            }}
            onMouseEnter={(e) => {
              if (!saving) e.currentTarget.style.background = "#4840D4";
            }}
            onMouseLeave={(e) => {
              if (!saving) e.currentTarget.style.background = "#5B50E8";
            }}
          >
            {saving ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}
