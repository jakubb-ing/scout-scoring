import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { execSync } from "node:child_process";
import packageJson from "./package.json";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Dev běží s turbopackem a bez SW — offline chování se ověřuje na buildu.
  disable: process.env.NODE_ENV === "development",
});

/**
 * Hash buildu do patičky. U PWA je to jediný způsob, jak odlišit „uživatel
 * kouká na starou verzi ze service workeru" od „nasazení neproběhlo", takže
 * se nespoléhá na ruční nastavení: bere se z proměnných, které dodává CI,
 * a jako poslední možnost z gitu.
 */
function resolveBuildSha(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_BUILD_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.RENDER_GIT_COMMIT;

  if (fromEnv) return fromEnv.slice(0, 7);

  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    // Build z tarballu bez .git — patička ukáže jen verzi.
    return "";
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_BUILD_SHA: resolveBuildSha(),
  },
};

export default withSerwist(nextConfig);
