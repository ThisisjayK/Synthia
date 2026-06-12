// api/stage1.js
// Vercel serverless function for Stage 1 individual interview analysis.
// Called by the React frontend at POST /api/stage1.
// Keeps the Anthropic API key server-side only.
//
// Request body fields:
//   interviewId       (required) UUID of the interview record
//   textToAnalyze     (required) anonymized_text if Stage 0 ran, raw_input_text otherwise
//   interviewLabel    (required) e.g. "Interview 3 - Priya (Float Nurse)"
//   inputType         (required) "Manual Notes" | "AI Note-Taker Output" | "Full Transcript"
//   productDescription (optional) from project record
//   targetUserType    (optional) from project record
//   domain            (optional) from project record
//   segmentTag        (optional) from interview record
//   interviewMethod   (optional) from interview record
//
// Returns: { analysis } where analysis is an object with 7 keys (see EXPECTED_KEYS below).

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;
const TEMPERATURE = 0.3;
const TIMEOUT_MS = 30_000;

// The 7 keys we expect in the JSON response. Used for validation.
const EXPECTED_KEYS = [
  "pain_points",
  "current_workarounds",
  "jobs_to_be_done",
  "emotional_signals",
  "notable_quotes",
  "unmet_needs",
  "what_to_build",
];

// Input type instructions keyed by DB constraint values:
// manual | ai_notes | transcript
const INPUT_TYPE_INSTRUCTIONS = {
  manual:
    "This input consists of manual notes taken during the interview. They may be fragmented, use shorthand, or have gaps in coverage. Do not fill gaps with assumptions. Analyze only what is explicitly present.",
  ai_notes:
    "This input is output from an AI note-taker (e.g. Otter.ai, Fireflies). It includes filler talk, pleasantries, and low-signal content. Focus on substantive statements. Filter out generic conversational filler.",
  transcript:
    "This input is a full verbatim transcript. It is the most complete input type but may be long. Prioritize the most meaningful signals. Do not summarize indiscriminately; identify what is genuinely significant.",
};

function buildSystemPrompt({
  productDescription,
  targetUserType,
  domain,
  segmentTag,
  interviewMethod,
  inputType,
}) {
  // Context block. Only include fields that were provided.
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
  if (segmentTag) {
    contextLines.push(`Interview participant segment: ${segmentTag}`);
  }
  if (interviewMethod) {
    contextLines.push(`Interview method: ${interviewMethod}`);
  }
  const contextBlock =
    contextLines.length > 0
      ? `CONTEXT\n${contextLines.join("\n")}`
      : "CONTEXT\nNo project context provided.";

  // Input type instruction.
  const inputTypeInstruction =
    INPUT_TYPE_INSTRUCTIONS[inputType] ?? INPUT_TYPE_INSTRUCTIONS["manual"];

  return `You are an expert UX researcher and product strategist specializing in user interview synthesis.

${contextBlock}

INPUT TYPE
${inputTypeInstruction}

TASK
Analyze the interview content against exactly the following 7 categories. Do not add or remove categories.

1. pain_points
What frustrates the user. What slows them down. What creates friction in their current workflow. Be specific and behavioral, not vague. Each item should be one sentence.

2. current_workarounds
What the user does today instead of using a proper solution. Behavioral evidence of unmet needs. Include a brief explanation of why the workaround exists.

3. jobs_to_be_done
The underlying outcomes the user is trying to achieve, independent of any specific solution. Use standard JTBD format: "When [situation], I want to [motivation], so I can [outcome]." Provide 2 to 4 statements. These are inferred, not directly quoted. Reason about underlying motivation.

4. emotional_signals
Moments of frustration, delight, confusion, urgency, resignation, or enthusiasm detected in the language or tone. Tag each signal with the triggering topic. Format: "[Emotion] - [description]."

5. notable_quotes
Verbatim or near-verbatim lines from the interview that are striking, specific, or stakeholder-ready. Use only meaningful quotes, not generic filler. Each quote must be tagged with the interview label provided in the user message. Format: "[Quote]" ([Interview Label])

6. unmet_needs
Things the user did not ask for explicitly but implied through their words, workarounds, or frustrations. Start each item with "The user may need..." and explain the inference. Flag these as hypotheses, not facts.

7. what_to_build
A synthesized 2 to 3 sentence prose recommendation based on this single interview. What feature, workflow improvement, or product decision does this interview most strongly suggest? Must be grounded in evidence from the other 6 categories. Do not give generic advice.

RULES
- If you cannot find sufficient evidence for a category, set its value to the string "Not enough information provided" rather than guessing.
- For notable_quotes, use verbatim or near-verbatim language only. Do not paraphrase in this section.
- Do not fabricate quotes or patterns. Only surface what is present in the input.
- The what_to_build field must be prose (a paragraph), not a list.

OUTPUT FORMAT
Return a valid JSON object with exactly these 7 keys. No preamble, no postscript, no markdown, no code fences. Raw JSON only.

{
  "pain_points": ["string", "string", ...],
  "current_workarounds": ["string", "string", ...],
  "jobs_to_be_done": ["string", "string", ...],
  "emotional_signals": ["string", "string", ...],
  "notable_quotes": ["string", "string", ...],
  "unmet_needs": ["string", "string", ...],
  "what_to_build": "string (prose paragraph)"
}

Each array field should contain one item per finding. If a field has no findings, use the string "Not enough information provided" as the sole array element. The what_to_build field is always a single string.`;
}

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    interviewId,
    textToAnalyze,
    interviewLabel,
    inputType,
    productDescription,
    targetUserType,
    domain,
    segmentTag,
    interviewMethod,
  } = req.body;

  // Required field validation
  if (!interviewId) {
    return res
      .status(400)
      .json({ error: "interviewId is required", type: "validation" });
  }
  if (!textToAnalyze || textToAnalyze.trim().length === 0) {
    return res
      .status(400)
      .json({ error: "textToAnalyze is required", type: "validation" });
  }
  if (!interviewLabel) {
    return res
      .status(400)
      .json({ error: "interviewLabel is required", type: "validation" });
  }
  if (!inputType) {
    return res
      .status(400)
      .json({ error: "inputType is required", type: "validation" });
  }
  if (!ANTHROPIC_API_KEY) {
    return res
      .status(500)
      .json({ error: "API key not configured", type: "config" });
  }

  const systemPrompt = buildSystemPrompt({
    productDescription,
    targetUserType,
    domain,
    segmentTag,
    interviewMethod,
    inputType,
  });

  const userMessage = `Interview Label: ${interviewLabel}

Interview Content:
${textToAnalyze}

Analyze this interview against the 7 categories as instructed.`;

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
        .json({ error: "Analysis timed out.", type: "timeout" });
    }
    return res.status(502).json({
      error: "Network error reaching Anthropic API.",
      type: "network",
    });
  }

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
      .json({ error: "Stage 1 returned an empty response.", type: "empty" });
  }

  // Parse JSON response
  let parsed;
  try {
    const cleaned = rawContent.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return res
      .status(502)
      .json({ error: "Stage 1 returned malformed JSON.", type: "parse" });
  }

  // Validate all 7 keys are present
  const missingKeys = EXPECTED_KEYS.filter((k) => !(k in parsed));
  if (missingKeys.length > 0) {
    return res.status(502).json({
      error: `Stage 1 response missing keys: ${missingKeys.join(", ")}.`,
      type: "parse",
    });
  }

  // Return parsed analysis to React frontend.
  // React is responsible for writing to Supabase (stage1_output, analysis_status: 'complete').
  return res.status(200).json({
    analysis: parsed,
  });
}
