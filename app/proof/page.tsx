import type { Metadata } from "next";
import { Suspense } from "react";
import { ProofConsole } from "@/features/proof/proof-console";
import "@/features/proof/proof.css";

export const metadata: Metadata = {
  title: "Live proof | StepFree",
  description:
    "Run the StepFree accessibility incident drill end to end: official source, verified extraction, human-reviewed incident, live reroute, and traveller alert.",
};

export default function ProofPage() {
  return (
    <Suspense fallback={null}>
      <ProofConsole />
    </Suspense>
  );
}
