/** @type {import('next').NextConfig} */

const backendUrl = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.BACKEND_URL ||
  "https://bitiqlab-v2-production.up.railway.app"
).replace(/\/$/, "");

const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    NEXT_PUBLIC_API_URL: backendUrl,
    NEXT_PUBLIC_API_USE_PROXY: process.env.NEXT_PUBLIC_API_USE_PROXY ?? "true",
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
