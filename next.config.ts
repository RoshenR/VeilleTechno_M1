import type { NextConfig } from "next";

// Cache Components disabled on purpose: every page is per-user (Supabase cookies),
// so nothing private may land in a shared cache.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
