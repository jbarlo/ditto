import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default nextConfig;
