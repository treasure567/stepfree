"use node";

import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { sha256 } from "./lib/crypto";
import { excerptIsVerbatim } from "./lib/excerpt";
import { scrapeOfficialAccessibilityPage } from "./providers/firecrawl";
import { extractAccessibilityIncidents } from "./providers/openai";

const sourceName = "Transport for London planned accessibility works";
const sourceUrl =
  "https://tfl.gov.uk/status-updates/stations-lifts-and-escalators-works-and-closures?intcmp=54583";

type RefreshResult = {
  status: "completed" | "unchanged" | "in-progress";
  runId: Id<"monitoringRuns">;
  candidateCount: number;
};

type StartRunResult = {
  runId: Id<"monitoringRuns">;
  created: boolean;
  status: "processing" | "completed" | "failed";
  candidateCount: number;
};

type CompleteRunResult = {
  completed: boolean;
  candidateCount: number;
};

function failureCode(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return "PROVIDER_TIMEOUT";
    }

    if (error.message.endsWith(" is not configured")) {
      return "PROVIDER_CONFIG_MISSING";
    }

    if (error.message.startsWith("Firecrawl")) {
      return "FIRECRAWL_FAILED";
    }

    if (error.message.startsWith("OpenAI")) {
      return "OPENAI_FAILED";
    }
  }

  return "MONITORING_FAILED";
}

export const refreshOfficialAccessibilityEvidence = internalAction({
  args: {},
  handler: async (ctx): Promise<RefreshResult> => {
    let runId: Id<"monitoringRuns"> | null = null;

    try {
      const scrape = await scrapeOfficialAccessibilityPage(sourceUrl);
      const contentHash = await sha256(scrape.markdown);
      const startedAt = Date.now();
      const run: StartRunResult = await ctx.runMutation(
        internal.monitoringData.startRun,
        {
          sourceName,
          sourceUrl: scrape.sourceUrl,
          contentHash,
          startedAt,
        },
      );
      runId = run.runId;

      if (!run.created) {
        return {
          status:
            run.status === "processing"
              ? "in-progress" as const
              : "unchanged" as const,
          runId,
          candidateCount: run.candidateCount,
        };
      }

      const extraction = await extractAccessibilityIncidents(scrape.markdown);
      const candidates = extraction.incidents.map((candidate) => ({
        ...candidate,
        excerptVerified: excerptIsVerbatim(
          scrape.markdown,
          candidate.sourceExcerpt,
        ),
      }));
      const result: CompleteRunResult = await ctx.runMutation(
        internal.monitoringData.completeRun,
        {
          runId,
          model: extraction.model,
          completedAt: Date.now(),
          candidates,
        },
      );

      return {
        status: "completed" as const,
        runId,
        candidateCount: result.candidateCount,
      };
    } catch (error) {
      if (runId) {
        await ctx.runMutation(internal.monitoringData.failRun, {
          runId,
          failureCode: failureCode(error),
          completedAt: Date.now(),
        });
      } else {
        const failedAt = Date.now();
        await ctx.runMutation(internal.monitoringData.recordFetchFailure, {
          sourceName,
          sourceUrl,
          contentHash: await sha256(`${sourceUrl}:${failedAt}`),
          failureCode: failureCode(error),
          failedAt,
        });
      }

      throw error;
    }
  },
});
