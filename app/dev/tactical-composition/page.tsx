import { AuthGate } from "../../auth-gate";
import { ExerciseTacticalBoard } from "../../components/exercise-tactical-board";
import {
  applySemanticTacticalComposition,
  classifyTacticalFamily,
  generateTacticalDiagram,
  refineTacticalComposition,
  resolveTacticalCompositionSide,
  resolveTacticalTemplate,
} from "../../../lib/tactical-diagram";
import type { Exercise } from "../../../lib/types";

const baseExercise: Exercise = {
  id: "semantic-preview",
  codice: "GK-DEV",
  nome: "Demo",
  category_id: 1,
  subcategory_id: 1,
  categoria: "Tecnica",
  sottocategoria: "Demo",
  fase: "Analitico",
  obiettivo: "Confronto composizione tattica",
  descrizione: "Demo",
  durata_min: 10,
  portieri_min: 1,
  portieri_max: 2,
  intensita: "Media",
  difficolta: 2,
  materiale: "Palloni",
  variante: null,
  coaching_points: "",
  errori_comuni: "",
  schema_step_1: "Azione iniziale",
  schema_step_2: "Intervento",
  schema_step_3: "Recupero",
  schema_step_4: null,
  schema_step_5: null,
  schema_step_6: null,
  scenario_gara: null,
  numero_azioni: null,
  attivo: true,
};

const samples: Array<[string, Partial<Exercise>]> = [
  ["Tuffo laterale", { nome: "Tuffo laterale su tiro diagonale", descrizione: "Il tiratore conclude e il portiere effettua un tuffo laterale" }],
  ["Cross", { nome: "Cross da sinistra", descrizione: "Il servitore effettua un cross e il portiere interviene" }],
  ["Tecnica di piede", { nome: "Tecnica di piede", descrizione: "Il portiere passa il pallone all'appoggio" }],
  ["1 contro 1", { nome: "1 contro 1 frontale", descrizione: "L'attaccante conduce verso il portiere" }],
  ["Uscita alta", { nome: "Uscita alta su cross", descrizione: "Il servitore crossa e il portiere esegue una presa alta" }],
  ["Uscita bassa", { nome: "Uscita bassa", descrizione: "L'attaccante conduce e il portiere interviene in uscita bassa" }],
  ["Doppio intervento", { nome: "Doppio intervento combinazione", descrizione: "Il portiere esegue due interventi consecutivi" }],
  ["Seconda palla", { nome: "Seconda palla", descrizione: "Il tiratore conclude e l'appoggio serve una seconda palla" }],
  ["Posizionamento", { nome: "Posizionamento porta", descrizione: "Il portiere adegua la posizione rispetto alla palla" }],
  ["Match Simulation", { nome: "Match Simulation seconda palla", descrizione: "Sequenza di gara con tiro, recupero e seconda palla" }],
];

function TacticalCompositionComparison() {
  return <main className="tactical-composition-page">
    <header>
      <span className="eyebrow">Development preview</span>
      <h1>Semantic Tactical Composition</h1>
      <p>Confronto con gli stessi dati di partenza. Cambia solamente la composizione automatica; renderer e asset sono V2 Final.</p>
    </header>
    <div className="tactical-composition-list">
      {samples.map(([title, patch]) => {
        const exercise = { ...baseExercise, ...patch };
        const raw = generateTacticalDiagram(exercise, { refineComposition: false });
        const current = refineTacticalComposition(raw, resolveTacticalTemplate(exercise), "automatic");
        const semantic = applySemanticTacticalComposition(raw, classifyTacticalFamily(exercise), resolveTacticalCompositionSide(exercise), "automatic");
        return <section key={title} className="tactical-composition-case">
          <h2>{title}</h2>
          <div className="tactical-composition-grid">
            <article><strong>COMPOSITION REFINED ATTUALE</strong><ExerciseTacticalBoard diagram={current} rendererVersion="v2-final" /></article>
            <article><strong>SEMANTIC COMPOSITION</strong><ExerciseTacticalBoard diagram={semantic} rendererVersion="v2-final" /></article>
          </div>
        </section>;
      })}
    </div>
  </main>;
}

export default function Page() {
  return <AuthGate><TacticalCompositionComparison /></AuthGate>;
}
