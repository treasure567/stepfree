import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ConvexClientProvider } from "@/shared/providers/convex-client-provider";
import { SpaFallbackRedirect } from "@/shared/providers/spa-fallback";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

const spaCaptureScript =
  "(function(){try{var p=location.pathname;if(p!=='/'&&!/\\.[a-zA-Z0-9]+$/.test(p)){sessionStorage.setItem('__stepfree_spa_path',p+location.search+location.hash);}}catch(e){}})();";

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.tile.openstreetmap.fr https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site https://*.tile.openstreetmap.fr https://*.tile.openstreetmap.org",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StepFree | The live accessibility layer for every journey",
  description:
    "StepFree monitors step-free access, verifies station incidents, and reroutes travellers before a broken lift becomes a dead end.",
  applicationName: "StepFree",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "StepFree",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#071c19",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased`}
    >
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content={contentSecurityPolicy}
        />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: spaCaptureScript }} />
        <ConvexClientProvider>
          <SpaFallbackRedirect />
          {children}
        </ConvexClientProvider>
      </body>
    </html>
  );
}
