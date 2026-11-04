import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXTMOVE_LOCAL === "1" ? ".next-local" : ".next",
  devIndicators: false,
  outputFileTracingExcludes: {"*": ["./.local-runtime/**", "./.runtime/**", "./.sites-runtime/**", "./work/**"]},
};

export default nextConfig;
