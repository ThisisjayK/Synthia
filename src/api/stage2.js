// src/api/stage2.js
// React-facing wrapper for the Stage 2 serverless function.
// Fetches all complete interviews for a project, calls /api/stage2,
// then upserts the comparison report to Supabase.
// Returns { report } on success. Throws a typed error on failure.
//
// Error handling per PRD Section 10 and 12.2:
//   - Offline check before fetch
//   - AbortController timeout (60s per PRD Section 12.2)
//   - JSON parse guard (server may return non-JSON on gateway errors)
//   - Typed errors throughout so UI can map to correct recovery action

import { supabase } from "../supabaseClient";

const STAGE2_TIMEOUT_MS = 60_000;

export async function runStage2({ projectId }) {
  if (!projectId) {
    throw Object.assign(new Error("projectId is required."), {
      type: "validation",
    });
  }

  // Fetch all complete interviews for this project.
  const { data: interviews, error: fetchError } = await supabase
    .from("interviews")
    .select("id, label, stage1_output, segment_tag")
    .eq("project_id", projectId)
    .eq("analysis_status", "complete");

  if (fetchError) {
    throw Object.assign(
      new Error("Could not load interviews. Please try again."),
      { type: "database" },
    );
  }

  if (!interviews || interviews.length < 2) {
    throw Object.assign(
      new Error("You need at least 2 analyzed interviews to run a comparison."),
      { type: "validation" },
    );
  }

  // Offline check before attempting the network call.
  if (!navigator.onLine) {
    throw Object.assign(
      new Error(
        "You appear to be offline. Please check your connection and try again.",
      ),
      { type: "offline" },
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STAGE2_TIMEOUT_MS);

  let response;
  try {
    response = await fetch("/api/stage2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        interviews: interviews.map((i) => ({
          interviewLabel: i.label,
          segmentTag: i.segment_tag,
          stage1Output: i.stage1_output,
        })),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw Object.assign(
        new Error("Comparison timed out. Please try again."),
        { type: "timeout" },
      );
    }
    throw Object.assign(
      new Error("Network error. Check your connection and try again."),
      { type: "network" },
    );
  } finally {
    clearTimeout(timeoutId);
  }

  // Guard against non-JSON responses (Vercel 500, gateway error HTML pages, etc.)
  let result;
  try {
    result = await response.json();
  } catch {
    throw Object.assign(
      new Error("We received an unexpected response. Please try again."),
      { type: "malformed" },
    );
  }

  if (!response.ok) {
    const type = result.type ?? "unknown";
    const message =
      type === "timeout"
        ? "Comparison timed out. Please try again."
        : (result.error ??
          "Comparison failed. This is usually temporary. Please try again.");
    throw Object.assign(new Error(message), { type });
  }

  // Serverless function returns { report }, not { stage2Output }
  const stage2Output = result.report;

  if (!stage2Output) {
    throw Object.assign(
      new Error("We received an unexpected response. Please try again."),
      { type: "empty" },
    );
  }

  // Upsert the report. Requires a unique constraint on project_id in
  // comparison_reports. If not already added:
  // ALTER TABLE comparison_reports ADD CONSTRAINT comparison_reports_project_id_key UNIQUE (project_id);
  const { error: upsertError } = await supabase
    .from("comparison_reports")
    .upsert(
      {
        project_id: projectId,
        stage2_output: stage2Output,
        interview_ids_included: interviews.map((i) => i.id),
        interview_count_at_generation: interviews.length,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );

  if (upsertError) {
    throw Object.assign(
      new Error("Report could not be saved. Please try again."),
      { type: "database" },
    );
  }

  return { report: stage2Output, interviewCount: interviews.length };
}
