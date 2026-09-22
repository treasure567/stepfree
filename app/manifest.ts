import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StepFree",
    short_name: "StepFree",
    description: "Live step-free journey intelligence.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f1e8",
    theme_color: "#071c19",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
