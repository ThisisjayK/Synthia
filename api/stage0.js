// api/stage0.js
// Vercel serverless function for Stage 0 anonymization.
// Called by the React frontend at POST /api/stage0.
// Keeps the Anthropic API key server-side only.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;
const TEMPERATURE = 0;
const TIMEOUT_MS = 30000;

const STAGE0_SYSTEM_PROMPT = `You are a data privacy specialist. Your only task is to identify and replace personally identifiable information (PII) in the text provided.

PII to identify and replace:
- Full names of individuals (participants, colleagues, anyone mentioned)
- Organization names, company names, hospital names, school names
- Job titles combined with names (e.g. Dr. Smith, Nurse Sarah)
- Locations specific enough to identify an individual or organization (street addresses, specific building names)
- Email addresses
- Phone numbers
- Any other information that could identify a specific real person or organization

Replacement rules:
- Replace each unique individual with a consistent placeholder: Participant A, Participant B, Participant C, and so on
- Replace each unique organization with: Organization 1, Organization 2, Organization 3, and so on
- Use the same placeholder every time the same person or organization appears in the text
- Do not replace generic role labels that are not attached to a specific person (e.g. "the nurse", "a department head", "my manager" are acceptable; "Nurse Sarah", "Head of Department James" are not)
- Do not alter, summarize, or interpret the content in any other way. Only replace PII.

Output format:
Return a valid JSON object with exactly these two keys. No preamble, no postscript, no markdown, no code fences. Raw JSON only.

{
  "anonymized_text": "String. The full text with all PII replaced. Preserve all original formatting, line breaks, and structure.",
  "substitution_log": "String. Every replacement made, one per line, using ASCII arrow: Original -> Replacement. If no PII was found, return the single word NONE."
}`;

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { interviewId, rawText } = req.body;

  if (!interviewId) {
    return res
      .status(400)
      .json({ error: "interviewId is required", type: "validation" });
  }
  if (!rawText || rawText.trim().length === 0) {
    return res
      .status(400)
      .json({ error: "rawText is required", type: "validation" });
  }
  if (!ANTHROPIC_API_KEY) {
    return res
      .status(500)
      .json({ error: "API key not configured", type: "config" });
  }

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
        system: STAGE0_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Please anonymize the following interview content:\n\n${rawText}`,
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
        .json({ error: "Stage 0 timed out.", type: "timeout" });
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
      .json({ error: "Stage 0 returned an empty response.", type: "empty" });
  }

  // Parse JSON response
  let parsed;
  try {
    const cleaned = rawContent.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return res
      .status(502)
      .json({ error: "Stage 0 returned malformed JSON.", type: "parse" });
  }

  const anonymizedText = parsed.anonymized_text;
  const anonymizationLog = parsed.substitution_log ?? "NONE";

  if (!anonymizedText) {
    return res.status(502).json({
      error: "Stage 0 response missing anonymized_text field.",
      type: "parse",
    });
  }

  // Return the parsed result to the React frontend.
  // The frontend is responsible for writing to Supabase using its own client.
  // We do not write to Supabase here because the serverless function does not
  // have access to the Supabase service role key in this setup.
  // The frontend must await the Supabase write before triggering Stage 1.
  return res.status(200).json({
    anonymizedText,
    anonymizationLog,
  });
}
