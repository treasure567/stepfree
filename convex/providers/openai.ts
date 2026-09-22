export type ExtractedIncidentCandidate = {
  stationName: string;
  dateText: string;
  kind: "lift-outage" | "access-obstruction" | "station-closure";
  title: string;
  description: string;
  severity: "advisory" | "route-blocking";
  alternateAccess: string;
  confidence: number;
  sourceExcerpt: string;
};

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function outputText(payload: OpenAIResponse) {
  if (payload.output_text?.trim()) {
    return payload.output_text;
  }

  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
}

function isCandidate(value: unknown): value is ExtractedIncidentCandidate {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return (
    typeof item.stationName === "string" &&
    typeof item.dateText === "string" &&
    ["lift-outage", "access-obstruction", "station-closure"].includes(
      String(item.kind),
    ) &&
    typeof item.title === "string" &&
    typeof item.description === "string" &&
    ["advisory", "route-blocking"].includes(String(item.severity)) &&
    typeof item.alternateAccess === "string" &&
    typeof item.confidence === "number" &&
    item.confidence >= 0 &&
    item.confidence <= 1 &&
    typeof item.sourceExcerpt === "string"
  );
}

function normalizeCandidate(candidate: ExtractedIncidentCandidate) {
  return {
    stationName: candidate.stationName.trim().slice(0, 120),
    dateText: candidate.dateText.trim().slice(0, 160),
    kind: candidate.kind,
    title: candidate.title.trim().slice(0, 180),
    description: candidate.description.trim().slice(0, 1_000),
    severity: candidate.severity,
    alternateAccess: candidate.alternateAccess.trim().slice(0, 500),
    confidence: candidate.confidence,
    sourceExcerpt: candidate.sourceExcerpt.trim().slice(0, 500),
  };
}

export async function extractAccessibilityIncidents(markdown: string) {
  const apiKey = requiredEnvironmentValue("OPENAI_API_KEY");
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        instructions:
          "Extract only concrete accessibility disruptions and planned works stated in the supplied official transport page. Do not infer missing facts. Preserve the station, date wording, impact, alternate access, and a short exact source excerpt. Use route-blocking only when the notice removes a required step-free path or closes the station. Return an empty list when there are no qualifying notices.",
        input: markdown.slice(0, 50_000),
        max_output_tokens: 4_000,
        text: {
          format: {
            type: "json_schema",
            name: "accessibility_incidents",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                incidents: {
                  type: "array",
                  maxItems: 50,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      stationName: { type: "string" },
                      dateText: { type: "string" },
                      kind: {
                        type: "string",
                        enum: [
                          "lift-outage",
                          "access-obstruction",
                          "station-closure",
                        ],
                      },
                      title: { type: "string" },
                      description: { type: "string" },
                      severity: {
                        type: "string",
                        enum: ["advisory", "route-blocking"],
                      },
                      alternateAccess: { type: "string" },
                      confidence: {
                        type: "number",
                        minimum: 0,
                        maximum: 1,
                      },
                      sourceExcerpt: { type: "string" },
                    },
                    required: [
                      "stationName",
                      "dateText",
                      "kind",
                      "title",
                      "description",
                      "severity",
                      "alternateAccess",
                      "confidence",
                      "sourceExcerpt",
                    ],
                  },
                },
              },
              required: ["incidents"],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as OpenAIResponse;
    const text = outputText(payload);

    if (!text) {
      throw new Error("OpenAI returned no structured output");
    }

    const parsed = JSON.parse(text) as { incidents?: unknown };

    if (!Array.isArray(parsed.incidents) || !parsed.incidents.every(isCandidate)) {
      throw new Error("OpenAI returned an invalid incident payload");
    }

    return {
      model,
      incidents: parsed.incidents.map(normalizeCandidate),
    };
  } finally {
    clearTimeout(timeout);
  }
}
