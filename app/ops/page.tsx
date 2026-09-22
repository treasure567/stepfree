import type { Metadata } from "next";
import { OpsConsole } from "@/features/ops/ops-console";
import "@/features/ops/ops.css";

export const metadata: Metadata = {
  title: "Ops console | StepFree",
  description:
    "Reviewer and operations console: triage emergencies, review incident evidence, manage alerts, replay events and watch the live sources.",
};

export default function OpsPage() {
  return <OpsConsole />;
}
