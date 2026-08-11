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
const vite = await createServer({ root, configFile: false, plugins: [react()], server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const { ExerciseTacticalBoard } = await vite.ssrLoadModule("/app/components/exercise-tactical-board.tsx");
  const { applySemanticTacticalComposition, classifyTacticalFamily, generateTacticalDiagram, refineTacticalComposition, resolveTacticalCompositionSide, resolveTacticalTemplate } = await vite.ssrLoadModule("/lib/tactical-diagram.ts");
  const base = { id: "preview", codice: "GK-DEMO", nome: "Demo", category_id: 1, subcategory_id: 1, categoria: "Tecnica", sottocategoria: "Demo", fase: "Analitico", obiettivo: "Demo", descrizione: "Demo", durata_min: 10, portieri_min: 1, portieri_max: 2, intensita: "Media", difficolta: 2, materiale: "Palloni", variante: null, coaching_points: "", errori_comuni: "", schema_step_1: "Azione iniziale", schema_step_2: "Intervento", schema_step_3: "Recupero", schema_step_4: null, schema_step_5: null, schema_step_6: null, scenario_gara: null, numero_azioni: null, schema_url: null, foto_url: null, attivo: true };
  const samples = [
    ["Tuffo laterale", { nome: "Tuffo laterale su tiro diagonale", descrizione: "Il tiratore conclude e il portiere effettua un tuffo laterale" }],
    ["Cross", { nome: "Uscita alta su cross da sinistra", descrizione: "Il servitore effettua un cross e il portiere esce in presa alta" }],
    ["Tecnica di piede", { nome: "Tecnica di piede e costruzione", descrizione: "Il portiere riceve e passa verso l’appoggio laterale" }],
    ["1 contro 1", { nome: "1 contro 1 frontale", descrizione: "L’attaccante conduce verso la porta e il portiere avanza" }],
    ["Uscita alta", { nome: "Uscita alta in presa", descrizione: "Il servitore effettua un cross alto" }],
    ["Uscita bassa", { nome: "Uscita bassa frontale", descrizione: "L’attaccante conduce e il portiere interviene in uscita bassa" }],
    ["Doppio intervento", { nome: "Combinazione doppio intervento", descrizione: "Il tiratore conclude, recupero e secondo intervento" }],
    ["Seconda palla", { nome: "Seconda palla", descrizione: "Il tiratore conclude e l’appoggio serve la seconda palla" }],
    ["Posizionamento", { nome: "Posizionamento porta da sinistra", descrizione: "Allineamento sulla palla laterale e recupero al centro" }],
    ["Match Simulation", { nome: "Match Simulation", descrizione: "Il tiratore conclude, l’appoggio serve la seconda palla e il portiere recupera" }],
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
  await mkdir(resolve(root, "tmp"), { recursive: true });
  const comparisons = [
    { file: "tactical-board-v2-semantic-composition-comparison.png", title: "Composition Refined attuale / Semantic Composition", left: "COMPOSITION REFINED ATTUALE", right: "SEMANTIC COMPOSITION", leftVersion: "v2-final", rightVersion: "v2-final", note: "Stesso JSON di partenza; a destra layout semantico per famiglia e collision pass conservativo." },
  ];
  for (const item of comparisons) {
    const rows = samples.map(([title, patch], index) => {
      const exercise = { ...base, ...patch }; const diagram = generateTacticalDiagram(exercise, { refineComposition: false }); const current = refineTacticalComposition(diagram, resolveTacticalTemplate(exercise)); const semantic = applySemanticTacticalComposition(diagram, classifyTacticalFamily(exercise), resolveTacticalCompositionSide(exercise)); const left = dataUri(svgFrom(current, item.leftVersion)); const right = dataUri(svgFrom(semantic, item.rightVersion)); const y = 150 + index * rowHeight;
      return `<text x="40" y="${y - 20}" font-family="Arial" font-size="27" font-weight="700" fill="#173d2b">${escape(title)} · stesso JSON</text><text x="40" y="${y + 26}" font-family="Arial" font-size="21" font-weight="700" fill="#52705e">${item.left}</text><text x="780" y="${y + 26}" font-family="Arial" font-size="21" font-weight="800" fill="#1e6f3c">${item.right}</text><rect x="35" y="${y + 40}" width="690" height="435" rx="14" fill="#101914" stroke="#24372c"/><rect x="775" y="${y + 40}" width="690" height="435" rx="14" fill="#0a130e" stroke="#1e6f3c" stroke-width="2"/><image href="${left}" x="40" y="${y + 45}" width="${boardWidth}" height="${boardHeight}"/><image href="${right}" x="780" y="${y + 45}" width="${boardWidth}" height="${boardHeight}"/>`;
    }).join("");
    const comparison = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${150 + samples.length * rowHeight}" viewBox="0 0 ${width} ${150 + samples.length * rowHeight}"><rect width="100%" height="100%" fill="#eef3ef"/><text x="40" y="52" font-family="Arial" font-size="34" font-weight="800" fill="#143f28">${item.title}</text><text x="40" y="82" font-family="Arial" font-size="18" fill="#607066">${item.note} Stesso identico JSON.</text>${rows}</svg>`;
    const output = resolve(root, "tmp", item.file); await sharp(Buffer.from(comparison)).png().toFile(output); console.log(output);
  }
  const finalRows=samples.map(([title,patch],index)=>{const diagram=generateTacticalDiagram({...base,...patch}),board=dataUri(svgFrom(diagram,"v2-final")),y=120+index*470;return `<text x="35" y="${y-12}" font-family="Arial" font-size="25" font-weight="700" fill="#173d2b">${escape(title)} · nuovi asset proporzionati</text><rect x="30" y="${y+5}" width="700" height="435" rx="14" fill="#0a130e" stroke="#1e6f3c" stroke-width="2"/><image href="${board}" x="40" y="${y+10}" width="680" height="425"/>`;}).join("");
  const finalSheet=`<svg xmlns="http://www.w3.org/2000/svg" width="760" height="${120+samples.length*470}" viewBox="0 0 760 ${120+samples.length*470}"><rect width="100%" height="100%" fill="#eef3ef"/><text x="35" y="48" font-family="Arial" font-size="32" font-weight="800" fill="#143f28">V2 Final Wide · asset definitivi</text><text x="35" y="78" font-family="Arial" font-size="17" fill="#607066">Figure frontali, scala centralizzata, stesso tactical_diagram JSON.</text>${finalRows}</svg>`;
  const finalOutput=resolve(root,"tmp","tactical-board-v2-final-assets-examples.png");await sharp(Buffer.from(finalSheet)).png().toFile(finalOutput);console.log(finalOutput);
} finally {
  await vite.close();
}
