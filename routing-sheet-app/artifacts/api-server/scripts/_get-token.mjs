import { getPglite } from "@workspace/db";
const pglite = await getPglite();
const rs = await pglite.query("SELECT id, status_token FROM routing_sheets ORDER BY id LIMIT 1");
console.log(rs.rows[0].status_token);
