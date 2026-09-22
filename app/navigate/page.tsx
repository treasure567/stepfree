import type { Metadata } from "next";
import { Suspense } from "react";
import { NavigatorScreen } from "@/features/navigation/navigator-screen";
import "@/features/navigation/navigation.css";

export const metadata: Metadata = {
  title: "Live step-free navigator | StepFree",
  description: "Navigate a live step-free route with current station access and lift incidents.",
};

export default function NavigatePage() {
  return (
    <Suspense fallback={null}>
      <NavigatorScreen />
    </Suspense>
  );
}
