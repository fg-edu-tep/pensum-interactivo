/** @type {import('next').NextConfig} */

// `output: 'standalone'` + `outputFileTracingRoot` are ONLY for the self-hosted
// Docker image (P3). On Vercel they make the serverless function unable to
// resolve routes → every path 404s despite a green build. Vercel sets VERCEL=1
// automatically; the Dockerfile sets STANDALONE_BUILD=1.
const standalone =
  process.env.STANDALONE_BUILD === "1" && !process.env.VERCEL;

const nextConfig = {
  ...(standalone
    ? { output: "standalone", outputFileTracingRoot: process.cwd() }
    : {}),
  // exceljs is CommonJS with optional native-ish deps; keep it out of the bundle
  // so the admin template-download routes load it at runtime.
  serverExternalPackages: ["exceljs"],
  eslint: {
    // lint is run separately in CI; don't fail the container build on it
    ignoreDuringBuilds: true,
  },
  // /embed/* pages are meant to be iframed from other sites (department pages)
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
