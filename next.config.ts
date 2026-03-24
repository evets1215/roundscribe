import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // (Keep default config for Next.js 16. If you hit upload limits in production,
  // configure your hosting/proxy layer or chunk uploads.)
  turbopack: {
    root: "/home/user/roundscribe",
  },
};

export default nextConfig;
