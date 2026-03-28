import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok.io", "*.local", "192.168.1.*"],
  experimental: {
    serverBodySizeLimit: "15mb",
  } as NextConfig["experimental"],
};

export default nextConfig;
