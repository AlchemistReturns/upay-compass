import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@compass/shared", "@compass/upay-sim"],
};

export default nextConfig;
