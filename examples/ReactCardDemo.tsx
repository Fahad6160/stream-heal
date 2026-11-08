import React from "react";
import { useStreamingJson } from "stream-heal/react";

interface UserPersona {
  name: string;
  role: string;
  bio: string;
  skills: string[];
  metrics: {
    githubCommits: number;
    stars: number;
  };
}

export function LiveStreamingPersonaCard() {
  const { data, isLoading, isComplete, pipe, rawText } = useStreamingJson<UserPersona>({
    throttleMs: 25 // 40fps smooth UI updates without React thread lock
  });

  const handleStartStream = async () => {
    const response = await fetch("/api/generate-persona", { method: "POST" });
    if (response.body) {
      pipe(response.body);
    }
  };

  return (
    <div style={{ padding: "24px", maxWidth: "600px", fontFamily: "sans-serif" }}>
      <button
        onClick={handleStartStream}
        disabled={isLoading}
        style={{
          padding: "10px 16px",
          background: "#2563eb",
          color: "white",
          borderRadius: "6px",
          cursor: "pointer"
        }}
      >
        {isLoading ? "Generating with AI..." : "Generate AI Persona"}
      </button>

      <div
        style={{
          marginTop: "20px",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "20px"
        }}
      >
        <h2 style={{ margin: "0 0 8px 0" }}>
          {data?.name || <span style={{ color: "#94a3b8" }}>Generating Name...</span>}
        </h2>
        <h4 style={{ color: "#64748b", margin: "0 0 12px 0" }}>
          {data?.role || "Role..."}
        </h4>
        <p style={{ lineHeight: 1.6 }}>
          {data?.bio || "Awaiting AI stream..."}
        </p>

        {data?.skills && data.skills.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" }}>
            {data.skills.map((skill, index) => (
              <span
                key={index}
                style={{
                  background: "#f1f5f9",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "12px"
                }}
              >
                {skill}
              </span>
            ))}
          </div>
        )}

        {isComplete && (
          <div style={{ marginTop: "16px", color: "#16a34a", fontWeight: "bold" }}>
            ✓ Generation fully completed and validated!
          </div>
        )}
      </div>

      {rawText && (
        <details style={{ marginTop: "16px" }}>
          <summary style={{ cursor: "pointer", color: "#64748b" }}>
            View raw incoming tokens
          </summary>
          <pre style={{ background: "#f8fafc", padding: "12px", fontSize: "11px" }}>
            {rawText}
          </pre>
        </details>
      )}
    </div>
  );
}

