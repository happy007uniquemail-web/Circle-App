/**
 * next.config.ts - Next.js configuration
 *
 * Configures:
 * - App Router
 * - Tailwind CSS
 * - Image optimization
 * - Metadata generation
 * - Security headers
 * - Environment variables
 */

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable App Router
  reactStrictMode: false,

  // Compiler optimizations
  compiler: {
    // Remove console logs in production
    removeConsole: process.env.NODE_ENV === "production",
  },

  // Configure Tailwind CSS
  tailwindcss: {
    cssPath: "./src/app/tailwind.css",
    config: "./tailwind.config.ts",
  },

  // Configure images
  images: {
    domains: ["localhost", "127.0.0.1"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  // Configure experimental features
  experimental: {
    // App Router is enabled by default in newer Next.js
    appRouter: true,
  },

  // Headers for security
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
          // HSTS - enable only in production with https
          process.env.NODE_ENV === "production"
            ? {
                key: "Strict-Transport-Security",
                value: "max-age=31536000; includeSubDomains",
              }
            : {},
          // Content Security Policy
          {
            key: "Content-Security-Policy",
            value: (
              process.env.NODE_ENV === "production"
                ? "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-src 'self';"
                : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';"
            ),
          },
        ],
      },
    ];
  },
};

export default nextConfig;