import { WorkflowManager } from "@convex-dev/workflow";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

export const workflow = new WorkflowManager(components.workflow);

export const evidenceWorkflow = workflow
  .define({ args: {} })
  .handler(async (step): Promise<null> => {
    await step.runAction(
      internal.monitoring.refreshOfficialAccessibilityEvidence,
      {},
      { retry: true },
    );
    return null;
  });

export const emergencyEscalationWorkflow = workflow
  .define({ args: { emergencyId: v.id("emergencies"), windowMs: v.number() } })
  .handler(async (step, args): Promise<null> => {
    await step.sleep(args.windowMs);
    const awaiting: boolean = await step.runQuery(
      internal.emergency.isAwaitingAcknowledgement,
      { emergencyId: args.emergencyId },
    );
    if (awaiting) {
      await step.runMutation(internal.emergency.markEscalated, {
        emergencyId: args.emergencyId,
      });
    }
    return null;
  });

export const startEvidenceWorkflow = internalMutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    await workflow.start(ctx, internal.workflows.evidenceWorkflow, {});
    return null;
  },
});

export const startEmergencyEscalation = internalMutation({
  args: { emergencyId: v.id("emergencies"), windowMs: v.number() },
  handler: async (ctx, args): Promise<null> => {
    await workflow.start(ctx, internal.workflows.emergencyEscalationWorkflow, {
      emergencyId: args.emergencyId,
      windowMs: args.windowMs,
    });
    return null;
  },
});
