import { getPglite } from "@workspace/db";

const pglite = await getPglite();
const res = await pglite.query("SELECT table_name FROM information_schema.tables WHERE table_name = 'step_meta'");
console.log("step_meta table exists:", res.rows.length > 0);
if (res.rows.length > 0) {
  const cols = await pglite.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'step_meta' ORDER BY ordinal_position");
  console.log("Columns:");
  for (const c of cols.rows) {
    console.log(`  ${c.column_name}: ${c.data_type}`);
  }
}
