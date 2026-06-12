// src/api/stage1.js
// React-facing wrapper for the Stage 1 serverless function.
// Responsibilities:
//   1. Fetch the interview record from Supabase to get the correct text and metadata.
//   2. Select anonymized_text if anonymization_status is 'complete', otherwise raw_input_text.
//   3. Fetch the parent project record for context fields.
//   4. Call /api/stage1 with all required fields.
//   5. Validate the what_to_build field is a string (defensive check).
//   6. Write stage1_output and analysis_status: 'complete' to Supabase.
//   7. Return the analysis object to the caller.
//
// Error handling per PRD Section 10 and 12.2:
//   - Offline check before fetch
//   - AbortController timeout (30s per PRD Section 12.2)
//   - JSON parse guard (server may return non-JSON on gateway errors)
//   - Typed errors throughout so UI can map to correct recovery action

import { supabase } from "../supabaseClient";

const STAGE1_TIMEOUT_MS = 30_000;

export async function runStage1({ interviewId }) {
  // Step 1: Fetch the interview record.
  const { data: interview, error: interviewError } = await supabase
    .from("interviews")
    .select(
      "id, project_id, label, input_type, segment_tag, method, anonymization_status, raw_input_text, anonymized_text",
    )
    .eq("id", interviewId)
    .single();

  if (interviewError || !interview) {
    throw Object.assign(
      new Error("Could not load interview. Please try again."),
      { type: "database" },
    );
  }

  // Step 2: Select which text to send.
  // Privacy rule from PRD Section 8.1: raw text must never be sent to the API
  // if Stage 0 has been run. anonymized_text takes precedence when available.
  const textToAnalyze =
    interview.anonymization_status === "complete"
      ? interview.anonymized_text
      : interview.raw_input_text;

  if (!textToAnalyze || textToAnalyze.trim().length === 0) {
    throw Object.assign(new Error("Interview has no content to analyze."), {
      type: "validation",
    });
  }

  // Step 3: Fetch the parent project for context fields.
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("product_description, target_user_type, domain")
    .eq("id", interview.project_id)
    .single();

  if (projectError || !project) {
    // Project context is optional for analysis to work. Log and continue
    // rather than hard-failing, but note this is a degraded experience.
    console.warn("Stage 1: could not load project context.", projectError);
  }

  // Step 4: Call the serverless function.
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
  const timeoutId = setTimeout(() => controller.abort(), STAGE1_TIMEOUT_MS);

  let response;
  try {
    response = await fetch("/api/stage1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        interviewId,
        textToAnalyze,
        interviewLabel: interview.label,
        inputType: interview.input_type,
        productDescription: project?.product_description ?? null,
        targetUserType: project?.target_user_type ?? null,
        domain: project?.domain ?? null,
        segmentTag: interview.segment_tag ?? null,
        interviewMethod: interview.method ?? null,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw Object.assign(
        new Error(
          "Analysis timed out. Please try again. If this continues, try shortening your input.",
        ),
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
      new Error(
        "We received an unexpected response. Please try again. If this continues, try shortening your input.",
      ),
      { type: "malformed" },
    );
  }

  if (!response.ok) {
    const type = result.type ?? "unknown";
    const message =
      type === "timeout"
        ? "Analysis timed out. Please try again. If this continues, try shortening your input."
        : (result.error ??
          "Analysis failed. This is usually temporary. Please try again.");
    throw Object.assign(new Error(message), { type });
  }

  const { analysis } = result;

  if (!analysis) {
    throw Object.assign(
      new Error(
        "We received an unexpected response. Please try again. If this continues, try shortening your input.",
      ),
      { type: "empty" },
    );
  }

  // Step 5: Defensive check on what_to_build.
  // The prompt specifies a string but the model can occasionally return an array.
  // Coerce to string here so the Supabase write and UI never receive an array.
  if (Array.isArray(analysis.what_to_build)) {
    analysis.what_to_build = analysis.what_to_build.join(" ");
  } else if (typeof analysis.what_to_build !== "string") {
    analysis.what_to_build = "Not enough information provided";
  }

  // Step 6: Write to Supabase.
  const { error: supabaseError } = await supabase
    .from("interviews")
    .update({
      stage1_output: analysis,
      analysis_status: "complete",
      date_analyzed: new Date().toISOString(),
    })
    .eq("id", interviewId);

  if (supabaseError) {
    throw Object.assign(
      new Error("Analysis completed but could not be saved. Please try again."),
      { type: "database" },
    );
  }

  // Step 7: Return the analysis to the caller so the UI can render immediately
  // without a second Supabase fetch.
  return { analysis };
}
