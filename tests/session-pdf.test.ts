import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluationPdfFilename, sanitizePdfFilename, trainingPdfFilename } from "../lib/session-pdf.ts";

test("i filename PDF sono deterministici e sanitizzati", () => {
  assert.equal(sanitizePdfFilename("Presa alta / rapidità!"), "presa-alta-rapidita");
  assert.equal(trainingPdfFilename("2026-08-16", "Presa alta / rapidità!"), "seduta_2026-08-16_presa-alta-rapidita.pdf");
});

test("evaluation e reassessment usano i prefissi e cognome_nome richiesti", () => {
  const payload = { session: { evaluation_type: "Complete", goalkeeper_name: "Luca Bianchi", date: "2026-08-16" } };
  assert.equal(evaluationPdfFilename(payload as never), "valutazione_bianchi_luca_2026-08-16.pdf");
  assert.equal(evaluationPdfFilename({ session: { ...payload.session, evaluation_type: "Reassessment" } } as never), "rivalutazione_bianchi_luca_2026-08-16.pdf");
});

test("il PDF valutazione viene precaricato prima del click di stampa", () => {
  const source = readFileSync(new URL("../app/components/session-pdf-export.tsx", import.meta.url), "utf8");
  assert.match(source, /useEffect\(\(\) => \{ void loadPayload\(\); \}, \[loadPayload\]\)/);
  assert.match(source, /get_evaluation_field_session", \{ requested_session_id: sessionId \}/);
  assert.match(source, /const exportEvaluation = \(\) => \{[\s\S]*state\.print\(/);
  assert.doesNotMatch(source, /const exportEvaluation = async/);
});

test("le schede PDF sono a una colonna e includono tutte le informazioni tecniche", () => {
  const component = readFileSync(new URL("../app/components/session-pdf-export.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.session-pdf-grid\{[^}]*grid-template-columns:1fr/);
  assert.match(component, />Materiale</);
  assert.match(component, />Obiettivo</);
  assert.match(component, />Svolgimento</);
  assert.match(component, />Coaching points</);
  assert.match(component, />Errori comuni</);
  assert.doesNotMatch(component, /procedure\.filter\(Boolean\)\.slice\(/);
});

test("il PDF impagina al massimo quattro esercizi per pagina", () => {
  const component = readFileSync(new URL("../app/components/session-pdf-export.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(component, /PDF_EXERCISES_PER_PAGE = 4/);
  assert.match(component, /paginatePdfItems\(data\.exercises\)/);
  assert.match(component, /paginatePdfItems\(exercises\.map/);
  assert.match(component, /pageIndex \* PDF_EXERCISES_PER_PAGE \+ itemIndex \+ 1/);
  assert.match(css, /\.session-pdf-sheet\{[^}]*height:279mm/);
  assert.match(css, /\.session-pdf-grid\{[^}]*grid-auto-rows:minmax\(0,1fr\)/);
});
