import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverBodySizeLimit: "15mb",
  } as NextConfig["experimental"],
};

export default nextConfig;
