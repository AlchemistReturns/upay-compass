import type { NextConfig } from "next";

// Response headers that cannot change how the app works: no sniffing, no framing, no referrer leak,
// and only this site may use the microphone (voice) or passkeys. A Content-Security-Policy is not
// set yet (see docs/pitch/security-report.md).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), geolocation=(), microphone=(self), publickey-credentials-get=(self), publickey-credentials-create=(self)",
  },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@compass/shared", "@compass/upay-sim"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
