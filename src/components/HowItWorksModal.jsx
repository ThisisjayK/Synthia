// src/components/HowItWorksModal.jsx
// Static explainer modal. No API calls, no Supabase.
// Content from PRD Section 15.2 including the data privacy paragraph.

export default function HowItWorksModal({ onClose }) {
  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
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
      <div
        style={{
          background: "#FFFFFF",
          borderRadius: "10px",
          width: "100%",
          maxWidth: "560px",
          maxHeight: "80vh",
          overflowY: "auto",
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
            How it works
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

        {/* Sections */}
        <Section title="What this tool does">
          Synthia takes your raw interview notes, transcripts, or AI note-taker
          output and turns them into structured research insights in seconds. No
          more spending hours manually tagging themes or pulling quotes.
        </Section>

        <Section title="How individual analysis works">
          When you analyze an interview, the AI reads your notes and organizes
          them into 7 categories: Pain Points, Current Workarounds, Jobs to Be
          Done, Emotional Signals, Notable Quotes, Unmet Needs, and a What to
          Build recommendation. Every interview in your project is analyzed
          against the same framework, so outputs are consistent and comparable.
        </Section>

        <Section title="How comparison works">
          Once you have 2 or more analyzed interviews in a project, you can run
          a comparison. The AI does not re-read your raw notes. Instead, it
          synthesizes the structured outputs from your individual analyses to
          find patterns across users. This makes the comparison faster, more
          consistent, and less susceptible to one noisy interview skewing the
          results.
        </Section>

        <Section title="What the comparison surfaces">
          The comparison report shows you: which pain points came up most often
          and in which interviews, shared workarounds that suggest strong unmet
          needs, places where users contradict each other (divergent signals),
          emotional hotspots across the research, differences between user
          segments if you have added segment tags, and an overall recommendation
          for what to build next.
        </Section>

        <Section title="What this tool is not">
          This tool is a synthesis aid. The quality of the output depends
          entirely on the quality of the notes you paste in. It is designed to
          help you organize and surface what is already in your research, not to
          replace your judgment as a researcher. Always verify AI-generated
          insights against your original notes.
        </Section>

        <Section title="What happens to your data" last>
          When you analyze an interview, the text is sent to the Claude API for
          processing. We strongly recommend using the Anonymize feature to strip
          names and organizations before analysis. When anonymization is used,
          only the anonymized version of your notes leaves this app. The
          original text stays in your project. Anthropic does not use API data
          to train its models. This tool is not suitable for content subject to
          HIPAA, GDPR without a Data Processing Agreement, or internal data
          classification policies. When in doubt, anonymize.
        </Section>

        {/* Close button */}
        <div style={{ marginTop: "28px", textAlign: "right" }}>
          <button
            onClick={onClose}
            style={{
              background: "#5B50E8",
              color: "#FFFFFF",
              border: "none",
              borderRadius: "6px",
              padding: "9px 20px",
              fontSize: "14px",
              fontWeight: 500,
              cursor: "pointer",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#4840D4")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#5B50E8")}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children, last = false }) {
  return (
    <div style={{ marginBottom: last ? 0 : "24px" }}>
      <h3
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: "#1A1A1A",
          margin: "0 0 6px 0",
          letterSpacing: "-0.01em",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          fontSize: "14px",
          color: "#475569",
          lineHeight: "1.65",
          margin: 0,
        }}
      >
        {children}
      </p>
    </div>
  );
}
