import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfkit reads its font metrics from disk at runtime, so it must not be bundled.
  serverExternalPackages: ["pdfkit", "sharp"],
};

export default nextConfig;
