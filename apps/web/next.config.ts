import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.join(currentDirectory, "../..");

const nextConfig: NextConfig = {
  transpilePackages: ["@noface/shared"],
  outputFileTracingRoot: workspaceRoot,
  turbopack: {
    root: workspaceRoot
  }
};

export default nextConfig;