import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

const runtimeRequire = createRequire("file:///C:/Users/Utente/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime-entry.js");
const sharp = runtimeRequire("sharp");
const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "tmp", "tactical-board-v1-v2-comparison.png");
const vite = await createServer({ root, configFile: false, plugins: [react()], server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const { ExerciseTacticalBoard } = await vite.ssrLoadModule("/app/components/exercise-tactical-board.tsx");
  const { generateTacticalDiagram } = await vite.ssrLoadModule("/lib/tactical-diagram.ts");
  const base = { id: "preview", codice: "GK-DEMO", nome: "Demo", category_id: 1, subcategory_id: 1, categoria: "Tecnica", sottocategoria: "Demo", fase: "Analitico", obiettivo: "Demo", descrizione: "Demo", durata_min: 10, portieri_min: 1, portieri_max: 2, intensita: "Media", difficolta: 2, materiale: "Palloni", variante: null, coaching_points: "", errori_comuni: "", schema_step_1: "Azione iniziale", schema_step_2: "Intervento", schema_step_3: "Recupero", schema_step_4: null, schema_step_5: null, schema_step_6: null, scenario_gara: null, numero_azioni: null, schema_url: null, foto_url: null, attivo: true };
  const samples = [
    ["Tuffo laterale", { nome: "Tuffo laterale su tiro diagonale", descrizione: "Il tiratore conclude e il portiere effettua un tuffo laterale" }],
    ["Cross", { nome: "Uscita alta su cross da sinistra", descrizione: "Il servitore effettua un cross e il portiere esce in presa alta" }],
    ["Tecnica di piede", { nome: "Tecnica di piede e costruzione", descrizione: "Il portiere riceve e passa verso l’appoggio laterale" }],
  ];
  const escape = value => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const svgFrom = (diagram, rendererVersion) => {
    const html = renderToStaticMarkup(React.createElement(ExerciseTacticalBoard, { diagram, rendererVersion }));
    const svg = html.match(/<svg[\s\S]*<\/svg>/)?.[0];
    if (!svg) throw new Error("SVG Tactical Board non trovato");
    return svg.replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ');
  };
  const dataUri = value => `data:image/svg+xml;base64,${Buffer.from(value).toString("base64")}`;
  const width = 1500; const boardWidth = 680; const boardHeight = 425; const rowHeight = 520;
  const rows = samples.map(([title, patch], index) => {
    const diagram = generateTacticalDiagram({ ...base, ...patch });
    const v1 = dataUri(svgFrom(diagram, "v1")); const v2 = dataUri(svgFrom(diagram, "v2")); const y = 150 + index * rowHeight;
    return `<text x="40" y="${y - 20}" font-family="Arial" font-size="27" font-weight="700" fill="#173d2b">${escape(title)} · stesso JSON</text><text x="40" y="${y + 26}" font-family="Arial" font-size="21" font-weight="700" fill="#52705e">V1</text><text x="780" y="${y + 26}" font-family="Arial" font-size="21" font-weight="700" fill="#2f7b47">V2</text><rect x="35" y="${y + 40}" width="690" height="435" rx="14" fill="#fff" stroke="#bccbc1"/><rect x="775" y="${y + 40}" width="690" height="435" rx="14" fill="#101914" stroke="#24372c"/><image href="${v1}" x="40" y="${y + 45}" width="${boardWidth}" height="${boardHeight}"/><image href="${v2}" x="780" y="${y + 45}" width="${boardWidth}" height="${boardHeight}"/>`;
  }).join("");
  const comparison = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${150 + samples.length * rowHeight}" viewBox="0 0 ${width} ${150 + samples.length * rowHeight}"><rect width="100%" height="100%" fill="#eef3ef"/><text x="40" y="52" font-family="Arial" font-size="34" font-weight="800" fill="#143f28">Tactical Board · confronto V1 / V2</text><text x="40" y="82" font-family="Arial" font-size="18" fill="#607066">Stesse coordinate, azioni e sequenze. Cambia esclusivamente il renderer SVG.</text>${rows}</svg>`;
  await mkdir(resolve(root, "tmp"), { recursive: true });
  await sharp(Buffer.from(comparison)).png().toFile(output);
  console.log(output);
} finally {
  await vite.close();
}
