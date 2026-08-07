import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter(line => line && !line.startsWith("#"))
    .map(line => line.split(/=(.*)/s).slice(0, 2)),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Configurazione Supabase incompleta");

const headers = { apikey: key, Authorization: `Bearer ${key}` };
for (const table of ["exercise_categories", "exercise_subcategories", "exercises", "training_exercises"]) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers: { ...headers, Prefer: "count=exact", Range: "0-0" } });
  let columns = [];
  if (response.ok) {
    const data = await response.json();
    columns = Object.keys(data[0] ?? {});
  }
  console.log(JSON.stringify({ table, exists: response.ok, status: response.status, columns, contentRange: response.headers.get("content-range") }));
}
