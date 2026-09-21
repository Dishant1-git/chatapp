// Where the backend (Express + Socket.IO) runs. Read at build time.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // The dev-mode badge sits on top of the message box on phones
  devIndicators: false,
  // Socket.IO requests end in "/socket.io/" — don't redirect them to remove the slash
  skipTrailingSlashRedirect: true,
  // Don't generate AGENTS.md / CLAUDE.md files during `next dev`
  agentRules: false,
  // This folder is the project root (the repo root also has a package.json)
  turbopack: { root: import.meta.dirname },

  // The browser only talks to the frontend. These requests are forwarded to the
  // backend, so the login cookie stays on one domain and no CORS setup is needed.
  // WebSocket connections are forwarded too.
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
      { source: '/uploads/:path*', destination: `${BACKEND_URL}/uploads/:path*` },
      { source: '/socket.io/', destination: `${BACKEND_URL}/socket.io/` },
    ];
  },

  // Basic security headers for every page
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Camera and microphone are allowed on our own pages only (for calls)
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
