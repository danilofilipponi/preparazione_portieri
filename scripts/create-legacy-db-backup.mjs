import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) throw new Error("Uso: node scripts/create-legacy-db-backup.mjs <audit.json> <backup.json>");

const source = JSON.parse(await readFile(resolve(inputArg), "utf8"));
const rows = Array.isArray(source.rows) ? source.rows : Array.isArray(source.exercises) ? source.exercises : [];
const records = rows.map(({ exercise_id, code, exercise_input: exercise }) => ({
  exercise_id,
  code,
  schema_url: exercise?.schema_url ?? null,
  foto_url: exercise?.foto_url ?? null,
  immagine_url: exercise?.immagine_url ?? null,
  tactical_diagram: exercise?.tactical_diagram ?? null,
  diagram_source: exercise?.diagram_source ?? null,
  diagram_updated_at: exercise?.diagram_updated_at ?? null,
}));
const counts = {
  records: records.length,
  schema_url: records.filter(item => item.schema_url).length,
  foto_url: records.filter(item => item.foto_url).length,
  immagine_url: records.filter(item => item.immagine_url).length,
  tactical_diagram: records.filter(item => item.tactical_diagram).length,
  diagram_source: records.filter(item => item.diagram_source).length,
};
if (counts.records !== 468 || counts.schema_url !== 36 || counts.foto_url !== 17 || counts.tactical_diagram !== 468 || counts.diagram_source !== 468) {
  throw new Error(`Gate backup non superato: ${JSON.stringify(counts)}`);
}
const payload = { created_at: new Date().toISOString(), source: "remote-full-catalog-audit", counts, records };
const sha256 = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
const output = resolve(outputArg);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ ...payload, sha256 }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, counts, sha256 }, null, 2));
