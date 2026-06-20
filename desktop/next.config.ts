import type { NextConfig } from "next";

// Local-first desktop build: the kennisbank ships as a fully static SPA bundled
// inside the Tauri app, talking client-side to the local brein sidecar on
// 127.0.0.1. No server, no auth gate, no Next runtime — `output: 'export'`
// emits a static `out/` that Tauri serves over its asset protocol.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
