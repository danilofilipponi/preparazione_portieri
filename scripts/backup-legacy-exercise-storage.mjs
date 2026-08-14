import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const [databaseBackupArg, outputRootArg] = process.argv.slice(2);
if (!databaseBackupArg || !outputRootArg) throw new Error("Uso: node scripts/backup-legacy-exercise-storage.mjs <database-backup.json> <output-root>");

const backup = JSON.parse(await readFile(resolve(databaseBackupArg), "utf8"));
const entries = backup.records.flatMap(record => [
  record.schema_url ? { code: record.code, type: "schema", url: record.schema_url } : null,
  record.foto_url ? { code: record.code, type: "foto", url: record.foto_url } : null,
].filter(Boolean));
const schemaCount = entries.filter(item => item.type === "schema").length;
const photoCount = entries.filter(item => item.type === "foto").length;
if (entries.length !== 53 || schemaCount !== 36 || photoCount !== 17) throw new Error(`Gate Storage non superato: total=${entries.length}, schema=${schemaCount}, foto=${photoCount}`);

const outputRoot = resolve(outputRootArg);
const manifest = [];
for (const entry of entries) {
  const path = `exercise-images/${entry.code}/${entry.type}.webp`;
  const response = await fetch(entry.url);
  if (!response.ok) throw new Error(`${path}: download HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error(`${path}: file vuoto`);
  const output = resolve(outputRoot, path);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes);
  manifest.push({ path, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), type: entry.type, exercise_code: entry.code, source_url: entry.url });
}
const manifestPayload = { created_at: new Date().toISOString(), bucket: "exercise-images", total: manifest.length, schema: schemaCount, foto: photoCount, files: manifest };
const manifestSha256 = createHash("sha256").update(JSON.stringify(manifestPayload)).digest("hex");
await writeFile(resolve(outputRoot, "manifest.json"), `${JSON.stringify({ ...manifestPayload, manifest_sha256: manifestSha256 }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputRoot, total: manifest.length, schema: schemaCount, foto: photoCount, manifestSha256 }, null, 2));
