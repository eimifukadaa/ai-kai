import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.fastpay.co.id",
      },
    ],
  },
};

export default nextConfig;
