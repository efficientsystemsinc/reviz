/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The reviz component library is intentionally heavy on client-side animation.
  // Transpile nothing exotic; keep the surface area minimal and fast.
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
