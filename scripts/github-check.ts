// npm run github:check — verifies the server-side GITHUB_TOKEN with GET /rate_limit (does not consume the
// primary quota). Prints the quota headers, never the token. Uses .env.local unless NODE_ENV=production.
import { loadEnvConfig } from "@next/env";
import { checkGithubAccess } from "@/domain/sources/github";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

checkGithubAccess()
  .then((r) => {
    console.log(`Jeton configuré : ${process.env.GITHUB_TOKEN ? "oui" : "non"}`);
    console.log(`Appel authentifié : ${r.authenticated ? "oui" : "non (quota anonyme)"}`);
    console.log(`Quota core : ${r.remaining}/${r.limit}, réinitialisation ${new Date(r.resetAt).toISOString()}`);
    process.exitCode = process.env.GITHUB_TOKEN && !r.authenticated ? 1 : 0;
  })
  .catch((e) => {
    console.error(`Échec : ${e.message}${e.kind ? ` (${e.kind})` : ""}`);
    process.exitCode = 1;
  });
