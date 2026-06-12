// api/stage2.js
// Vercel serverless function for Stage 2 cross-interview comparison.
// Called by the React frontend at POST /api/stage2.
// Keeps the Anthropic API key server-side only.
//
// Request body fields:
//   projectId           (required) UUID of the project record
//   interviews          (required) Array of objects, each with:
//                         { interviewLabel, segmentTag, stage1Output }
//                         stage1Output is the parsed JSON object from Stage 1.
//   productDescription  (optional) from project record
//   targetUserType      (optional) from project record
//   domain              (optional) from project record
//
// Returns: { report } where report is an object with 7 keys (see EXPECTED_KEYS).

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;
const TEMPERATURE = 0.3;
const TIMEOUT_MS = 110000;

// The 7 keys we expect in the JSON response. Used for validation.
const EXPECTED_KEYS = [
  "recurring_pain_points",
  "consensus_jtbd",
  "shared_workarounds",
  "divergent_signals",
  "emotional_hotspots",
  "underserved_segment_signals",
  "aggregate_what_to_build",
];

// Large project warning threshold from PRD Section 8.6.
const LARGE_PROJECT_THRESHOLD = 12;

function buildSystemPrompt({
  productDescription,
  targetUserType,
  domain,
  interviewCount,
  hasSegmentTags,
}) {
  const contextLines = [];
  if (productDescription) {
    contextLines.push(`Product being researched: ${productDescription}`);
  }
  if (targetUserType) {
    contextLines.push(`Target user type: ${targetUserType}`);
  }
  if (domain) {
    contextLines.push(`Industry / domain: ${domain}`);
  }
  const contextBlock =
    contextLines.length > 0
      ? `CONTEXT\n${contextLines.join("\n")}`
      : "CONTEXT\nNo project context provided.";

  const segmentInstruction = hasSegmentTags
    ? "Segment tags are present on some or all interviews. Where relevant, analyze patterns within and across segments separately. Surface signals that appear only within a specific segment in the underserved_segment_signals section."
    : 'No segment tags are present. Set underserved_segment_signals to the string "No segment tags found. Add segment tags to your interviews to enable segment-based analysis."';

  return `You are an expert research synthesizer. Your job is to find patterns, contradictions, and insights across multiple user interviews that have already been individually analyzed.

${contextBlock}

You will receive structured analysis outputs from ${interviewCount} user interviews. Each output follows the same 7-category format: pain_points, current_workarounds, jobs_to_be_done, emotional_signals, notable_quotes, unmet_needs, what_to_build.

ATTRIBUTION RULE
Every pattern, signal, and recommendation you surface must cite which specific interviews it comes from, using their exact interview labels as provided. Never state a pattern without attribution. Format attributions as a parenthetical list: (Interview 1 - Maria, Interview 3 - Priya).

DIVERGENCE RULE
Pay particular attention to contradictions between interviews. Where users disagree on the same topic, surface both sides explicitly. Do not resolve the contradiction. Do not pick a side. Flag it as a design decision for the PM to make. This is one of the most valuable outputs of the comparison.

SEGMENT RULE
${segmentInstruction}

TASK
Analyze across all interview outputs and produce a report with exactly the following 7 sections.

1. recurring_pain_points
Pain points that appear across multiple interviews, ranked by frequency. Each item must include: the pain point description, how many interviews mentioned it, and which interview labels. Most frequent first.

2. consensus_jtbd
Jobs to Be Done themes that appear across multiple interviews, indicating validated user motivation. Each item must include the JTBD statement and which interview labels share it.

3. shared_workarounds
The same workaround behavior appearing independently across multiple users. Strong evidence of an unmet need. Each item must include the workaround, why it exists, and which interview labels share it.

4. divergent_signals
Areas where interviews contradict each other on the same topic. Each item must show both sides with their respective interview attributions. Do not resolve the contradiction.

5. emotional_hotspots
Topics that triggered strong emotion across multiple interviews. Each item must include the topic, the dominant emotion, and which interview labels.

6. underserved_segment_signals
Patterns that appear only within a specific segment. Only populated when segment tags are present. Each item must show the signal, which segment it appeared in, and which segments it did not appear in.

7. aggregate_what_to_build
The synthesized product recommendation based on all interviews. 3 to 5 sentences of prose followed by a prioritized list of 3 to 5 specific recommendations. Each recommendation must cite the pattern evidence supporting it. This is the final output a PM would share with stakeholders.

RULES
- Every claim must be attributed to specific interview labels.
- Do not fabricate patterns. Only surface what is present across the inputs.
- If a section genuinely has no findings (e.g. no divergent signals exist), set its value to the string "No findings in this category."
- The aggregate_what_to_build field must be a single string containing both the prose and the prioritized list formatted as plain text (not nested JSON).
- All other fields are arrays of strings or objects. Use the format shown below.

OUTPUT FORMAT
Return a valid JSON object with exactly these 7 keys. No preamble, no postscript, no markdown, no code fences. Raw JSON only.

{
  "recurring_pain_points": ["string", "string", ...],
  "consensus_jtbd": ["string", "string", ...],
  "shared_workarounds": ["string", "string", ...],
  "divergent_signals": ["string", "string", ...],
  "emotional_hotspots": ["string", "string", ...],
  "underserved_segment_signals": ["string", "string", ...],
  "aggregate_what_to_build": "string (prose + prioritized list as plain text)"
}

Each array item should be a self-contained finding string that includes the attribution. If a section has no findings, use the single string "No findings in this category." as the sole array element. The aggregate_what_to_build field is always a single string.`;
}

function buildUserMessage(interviews) {
  const sections = interviews.map(
    ({ interviewLabel, segmentTag, stage1Output }) => {
      const label = segmentTag
        ? `${interviewLabel} [Segment: ${segmentTag}]`
        : interviewLabel;

      // Serialize stage1Output back to a readable block for the model.
      // Each bucket is printed as a labeled section so the model can parse structure.
      const buckets = [
        { key: "pain_points", label: "Pain Points" },
        { key: "current_workarounds", label: "Current Workarounds" },
        { key: "jobs_to_be_done", label: "Jobs to Be Done" },
        { key: "emotional_signals", label: "Emotional Signals" },
        { key: "notable_quotes", label: "Notable Quotes" },
        { key: "unmet_needs", label: "Unmet Needs" },
        { key: "what_to_build", label: "What to Build" },
      ];

      const bucketText = buckets
        .map(({ key, label: bucketLabel }) => {
          const value = stage1Output[key];
          if (!value) return `${bucketLabel}:\nNot enough information provided`;
          if (Array.isArray(value)) {
            return `${bucketLabel}:\n${value.map((item) => `- ${item}`).join("\n")}`;
          }
          return `${bucketLabel}:\n${value}`;
        })
        .join("\n\n");

      return `--- ${label} ---\n${bucketText}`;
    },
  );

  return `Here are the individual analyses for ${interviews.length} interviews in this project:\n\n${sections.join("\n\n")}\n\nNow synthesize across all of the above.`;
}

export default async function handler(req, res) {
  // Only allow POST
  console.log(
    "Stage 2 handler called. API key present:",
    !!process.env.ANTHROPIC_API_KEY,
  );
  console.log("Interview count:", req.body?.interviews?.length);
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { projectId, interviews, productDescription, targetUserType, domain } =
    req.body;

  // Required field validation
  if (!projectId) {
    return res
      .status(400)
      .json({ error: "projectId is required", type: "validation" });
  }
  if (!interviews || !Array.isArray(interviews) || interviews.length < 2) {
    return res.status(400).json({
      error: "At least 2 interviews with completed analysis are required.",
      type: "validation",
    });
  }

  // Validate each interview object has the minimum required fields.
  for (let i = 0; i < interviews.length; i++) {
    const iv = interviews[i];
    if (!iv.interviewLabel) {
      return res.status(400).json({
        error: `Interview at index ${i} is missing interviewLabel.`,
        type: "validation",
      });
    }
    if (!iv.stage1Output || typeof iv.stage1Output !== "object") {
      return res.status(400).json({
        error: `Interview "${iv.interviewLabel}" is missing stage1Output.`,
        type: "validation",
      });
    }
  }

  if (!ANTHROPIC_API_KEY) {
    return res
      .status(500)
      .json({ error: "API key not configured", type: "config" });
  }

  // Check whether any interview has a segment tag, to drive the segment instruction.
  const hasSegmentTags = interviews.some(
    (iv) => iv.segmentTag && iv.segmentTag.trim().length > 0,
  );

  // Flag large projects per PRD Section 8.6. Not a blocker, included in response.
  const isLargeProject = interviews.length > LARGE_PROJECT_THRESHOLD;

  const systemPrompt = buildSystemPrompt({
    productDescription,
    targetUserType,
    domain,
    interviewCount: interviews.length,
    hasSegmentTags,
  });

  const userMessage = buildUserMessage(interviews);

  console.log("Calling Anthropic API for Stage 2...");

  // Call Anthropic API with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let anthropicResponse;
  try {
    anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userMessage,
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return res
        .status(504)
        .json({ error: "Comparison timed out.", type: "timeout" });
    }
    return res.status(502).json({
      error: "Network error reaching Anthropic API.",
      type: "network",
    });
  }
  console.log("Anthropic API responded for Stage 2.");
  clearTimeout(timeoutId);

  if (!anthropicResponse.ok) {
    return res.status(502).json({
      error: `Anthropic API returned ${anthropicResponse.status}.`,
      type: "api",
    });
  }

  const data = await anthropicResponse.json();

  const rawContent = data.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (!rawContent) {
    return res
      .status(502)
      .json({ error: "Stage 2 returned an empty response.", type: "empty" });
  }

  // Parse JSON response
  let parsed;
  try {
    const cleaned = rawContent.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return res
      .status(502)
      .json({ error: "Stage 2 returned malformed JSON.", type: "parse" });
  }

  // Validate all 7 keys are present
  const missingKeys = EXPECTED_KEYS.filter((k) => !(k in parsed));
  if (missingKeys.length > 0) {
    return res.status(502).json({
      error: `Stage 2 response missing keys: ${missingKeys.join(", ")}.`,
      type: "parse",
    });
  }

  // Return parsed report to React frontend.
  // React is responsible for writing to Supabase (comparison_reports table).
  // isLargeProject is returned so the UI can surface the PRD Section 8.6 warning
  // without needing to recount on the client side.
  return res.status(200).json({
    report: parsed,
    interviewCount: interviews.length,
    isLargeProject,
  });
}
