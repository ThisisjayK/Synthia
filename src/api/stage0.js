// src/api/stage0.js
// React-facing wrapper for the Stage 0 serverless function.
// Calls /api/stage0, then writes the result to Supabase.
// Returns { anonymizedText, anonymizationLog } on success.
// Throws a typed error on failure.
//
// Error handling per PRD Section 10:
//   - Offline check before fetch
//   - AbortController timeout (20s — Stage 0 is faster than Stage 1)
//   - JSON parse guard (server may return non-JSON on gateway errors)
//   - Typed errors throughout so UI can map to correct recovery action

import { supabase } from "../supabaseClient";

const STAGE0_TIMEOUT_MS = 20_000;

export async function runStage0({ interviewId, rawText }) {
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
  const timeoutId = setTimeout(() => controller.abort(), STAGE0_TIMEOUT_MS);

  let response;
  try {
    response = await fetch("/api/stage0", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interviewId, rawText }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw Object.assign(
        new Error("Anonymization timed out. Please try again."),
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
    throw Object.assign(
      new Error(result.error ?? "Anonymization failed. Please try again."),
      { type: result.type ?? "unknown" },
    );
  }

  const { anonymizedText, anonymizationLog } = result;

  if (!anonymizedText) {
    throw Object.assign(
      new Error("We received an unexpected response. Please try again."),
      { type: "empty" },
    );
  }

  // Write to Supabase. Must complete before Stage 1 is triggered.
  const { error: supabaseError } = await supabase
    .from("interviews")
    .update({
      anonymized_text: anonymizedText,
      anonymization_log: anonymizationLog,
      anonymization_status: "complete",
    })
    .eq("id", interviewId);

  if (supabaseError) {
    throw Object.assign(
      new Error("Analysis data could not be saved. Please try again."),
      { type: "database" },
    );
  }

  return { anonymizedText, anonymizationLog };
}
