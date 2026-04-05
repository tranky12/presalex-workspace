import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'standalone',
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Exclude server-only packages from Edge/client bundles
  serverExternalPackages: ["@prisma/client", "prisma", "pdf-parse", "mammoth"],
};

export default nextConfig;
