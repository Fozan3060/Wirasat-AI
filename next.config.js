/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@pinecone-database/pinecone"],
  },
};

module.exports = nextConfig;
