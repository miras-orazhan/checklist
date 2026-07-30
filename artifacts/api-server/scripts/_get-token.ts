import { getPglite } from "@workspace/db";
const pglite = await getPglite();
const res = await pglite.query("SELECT id, status_token FROM routing_sheets ORDER BY id LIMIT 1");
process.stdout.write(res.rows[0].status_token);
