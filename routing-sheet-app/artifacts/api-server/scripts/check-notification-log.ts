import { getPglite } from "@workspace/db";

const pglite = await getPglite();
const res = await pglite.query(
  "SELECT id, channel, recipient, subject, status, error_message, object_type, object_id, created_at " +
  "FROM notification_log ORDER BY id DESC LIMIT 20",
);
console.log(JSON.stringify(res.rows, null, 2));
