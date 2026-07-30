/**
 * Smoke-test the candidate-status and termination-status public endpoints
 * by hitting them with the first available status token from the DB.
 *
 * Run from the api-server workspace:
 *   pnpm --filter @workspace/api-server tsx scripts/check-status-api.ts
 */
import { getPglite } from "@workspace/db";

const pglite = await getPglite();

// Candidate status
const rs = await pglite.query(
  "SELECT id, status_token FROM routing_sheets ORDER BY id LIMIT 1",
);
const candidateToken = rs.rows[0]?.status_token;
if (candidateToken) {
  console.log("\n=== Candidate status (token:", candidateToken, ") ===");
  const url = `http://127.0.0.1:5000/api/candidate-status/${candidateToken}`;
  const resp = await fetch(url);
  const data = await resp.json();
  console.log(JSON.stringify(data, null, 2));
} else {
  console.log("No routing sheets found — skipping candidate status check");
}

// Termination status — there may be none in a fresh DB
const ts = await pglite.query(
  "SELECT id, status_token FROM termination_sheets ORDER BY id LIMIT 1",
);
const termToken = ts.rows[0]?.status_token;
if (termToken) {
  console.log("\n=== Termination status (token:", termToken, ") ===");
  const url = `http://127.0.0.1:5000/api/termination-status/${termToken}`;
  const resp = await fetch(url);
  const data = await resp.json();
  console.log(JSON.stringify(data, null, 2));
} else {
  console.log("\n(No termination sheets in DB — skipping termination status check)");
}
