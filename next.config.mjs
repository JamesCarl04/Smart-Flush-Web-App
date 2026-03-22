/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent mqtt's Node.js-only modules from being bundled into the browser build
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
      };
    }
    return config;
  },
};

export default nextConfig;
