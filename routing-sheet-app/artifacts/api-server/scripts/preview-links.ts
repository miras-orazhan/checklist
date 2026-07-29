/**
 * Reproduce the exact link that would be sent in the email, by re-running
 * the same code path that notifyOfferSent() uses. Useful to verify the
 * fixed base URL + path prefix without needing the email adapter configured.
 */
import { getAppBaseUrl } from "../src/services/email";

const baseUrl = await getAppBaseUrl();
console.log("Resolved base URL:", baseUrl);

// Use the most recently created offer's token
const { getPglite } = await import("@workspace/db");
const pglite = await getPglite();
const res = await pglite.query(
  "SELECT id, candidate_id, token, status FROM offers ORDER BY id DESC LIMIT 5",
);

console.log("\nMost recent offers and the links that would be sent:");
for (const row of res.rows) {
  const link = `${baseUrl}/offer/${row.token}`;
  console.log(`  Offer #${row.id} (candidate ${row.candidate_id}, status ${row.status})`);
  console.log(`    → ${link}`);
}

// Also show termination-status sample link
const sheetsRes = await pglite.query(
  "SELECT id, employee_full_name, status_token FROM termination_sheets ORDER BY id DESC LIMIT 2",
);
console.log("\nTermination status links:");
for (const row of sheetsRes.rows) {
  console.log(`  Sheet #${row.id} (${row.employee_full_name})`);
  console.log(`    → ${baseUrl}/termination-status/${row.status_token}`);
}

// And candidate routing-sheet status links
const rsRes = await pglite.query(
  "SELECT id, candidate_id, status_token FROM routing_sheets ORDER BY id DESC LIMIT 5",
);
console.log("\nRouting sheet status links:");
for (const row of rsRes.rows) {
  console.log(`  Sheet #${row.id} (candidate ${row.candidate_id})`);
  console.log(`    → ${baseUrl}/status/${row.status_token}`);
}

console.log("\nInternal task links (for staff):");
console.log(`  Onboarding tasks: ${baseUrl}/my-tasks`);
console.log(`  Offboarding tasks: ${baseUrl}/termination-tasks`);
