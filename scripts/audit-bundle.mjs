// Checks the built web app (`pnpm build` first) for anything that must never reach a browser:
// service role keys, secret API keys, or the names of server-only environment variables.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../apps/web/.next/static", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1",
);
const forbidden = [
  [/service_role/i, "the words service_role"],
  [/SUPABASE_SERVICE_ROLE_KEY/, "service role env var name"],
  [/OPENAI_API_KEY/, "OpenAI env var name"],
  [/sk-[A-Za-z0-9_-]{20,}/, "an OpenAI-style secret key"],
  [/sb_secret_[A-Za-z0-9_-]{10,}/, "a Supabase secret key"],
  [/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "a JWT"],
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(js|css|html|json|map)$/.test(name)) yield p;
  }
}

let files = 0;
let failed = false;
for (const file of walk(root)) {
  files++;
  const text = readFileSync(file, "utf8");
  for (const [re, label] of forbidden) {
    const m = text.match(re);
    if (!m) continue;
    // The public anon key is itself a JWT (role: anon). Allow exactly that.
    if (label === "a JWT") {
      const payload = JSON.parse(Buffer.from(m[0].split(".")[1], "base64url").toString("utf8"));
      if (payload.role === "anon") continue;
    }
    failed = true;
    console.log(`✗ ${label} in ${file.replace(root, ".next/static")}`);
  }
}
console.log(`Scanned ${files} files in the client bundle.`);
console.log(failed ? "BUNDLE AUDIT FAILED" : "BUNDLE AUDIT PASSED");
process.exit(failed ? 1 : 0);
