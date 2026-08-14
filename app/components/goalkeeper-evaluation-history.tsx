"use client";

import { useMemo, useState } from "react";
import {
  buildParameterTimelines,
  compareDimensionResults,
  compareHistorySessions,
  compareParameterResults,
  type ComparabilityLevel,
  type GoalkeeperEvaluationHistorySession,
  type HistoryParameterResult,
  type HistoryProfile,
} from "../../lib/evaluation-history";
import { buildReassessmentChain } from "../../lib/evaluation-reassessment";

type Props = {
  sessions: GoalkeeperEvaluationHistorySession[];
  onOpenResults: (sessionId: string) => void;
  onCreateEvaluation: () => void;
  onReassess: (sessionId: string) => void;
};

type SessionFilter = "ALL" | "Complete" | "Targeted" | "Reassessment";
type View = "timeline" | "parameters" | "profiles" | "comparison";

const profiles: HistoryProfile[] = ["TECHNICAL PROFILE", "PERCEPTUAL / DECISIONAL PROFILE", "PHYSICAL OBSERVABLE PROFILE"];
const profileLabels: Record<HistoryProfile, string> = {
  "TECHNICAL PROFILE": "Profilo tecnico",
  "PERCEPTUAL / DECISIONAL PROFILE": "Profilo percettivo-decisionale",
  "PHYSICAL OBSERVABLE PROFILE": "Profilo fisico osservabile",
};
const levelLabels: Record<ComparabilityLevel, string> = {
  COMPARABLE: "Confrontabile",
  PARTIALLY_COMPARABLE: "Parzialmente confrontabile",
  LOW_COMPARABILITY: "Confrontabilità bassa",
  NOT_COMPARABLE: "Non confrontabile",
};
const reliabilityLabels = { STRONG: "Forte", GOOD: "Buona", LIMITED: "Limitata", INSUFFICIENT: "Insufficiente" } as const;

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function scoreLabel(value: number | null) {
  return value == null ? "—" : value.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function parameterState(parameter: HistoryParameterResult) {
  if (parameter.state === "NOT_OBSERVABLE") return `Non osservabile · ${parameter.notObservedDecisions} occasion${parameter.notObservedDecisions === 1 ? "e" : "i"}`;
  if (parameter.state === "NOT_EVALUATED") return "Non valutato in questa seduta";
  return `${parameter.validObservations} osservazioni · ${parameter.distinctExercises} esercizi`;
}

function comparisonTone(level: ComparabilityLevel) {
  return level.toLowerCase().replaceAll("_", "-");
}

function Delta({ level, delta }: { level: ComparabilityLevel; delta: number | null }) {
  if (delta == null || level === "NOT_COMPARABLE" || level === "LOW_COMPARABILITY") return <span className={`history-comparability ${comparisonTone(level)}`}>{levelLabels[level]}</span>;
  return <span className={`history-delta ${delta > 0 ? "positive" : delta < 0 ? "negative" : "stable"}`}>{delta > 0 ? "+" : ""}{scoreLabel(delta)}</span>;
}

export function GoalkeeperEvaluationHistory({ sessions, onOpenResults, onCreateEvaluation, onReassess }: Props) {
  const [view, setView] = useState<View>("timeline");
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("ALL");
  const [profileFilter, setProfileFilter] = useState<HistoryProfile | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const completeSessions = sessions.filter(item => item.evaluationType === "Complete");
  const [previousId, setPreviousId] = useState("");
  const [currentId, setCurrentId] = useState("");

  const filtered = useMemo(() => sessions.filter(session => {
    if (sessionFilter !== "ALL" && session.evaluationType !== sessionFilter) return false;
    if (profileFilter !== "ALL" && !session.parameters.some(parameter => parameter.profile === profileFilter)) return false;
    if (search.trim() && !session.parameters.some(parameter => parameter.name.toLowerCase().includes(search.trim().toLowerCase()))) return false;
    return true;
  }), [sessions, sessionFilter, profileFilter, search]);
  const timelines = useMemo(() => buildParameterTimelines(filtered).filter(timeline => profileFilter === "ALL" || timeline.profile === profileFilter), [filtered, profileFilter]);
  const previous = completeSessions.find(item => item.id === previousId) ?? completeSessions[1] ?? null;
  const current = completeSessions.find(item => item.id === currentId) ?? completeSessions[0] ?? null;
  const sessionComparison = previous && current && previous.id !== current.id ? compareHistorySessions(previous, current) : null;
  const latest = sessions[0] ?? null;
  const recentParameters = [...new Set(sessions.slice(0, 3).flatMap(session => session.parameters.filter(parameter => parameter.state === "EVALUATED").map(parameter => parameter.name)))].slice(0, 5);

  if (!sessions.length) return <section className="evaluation-history history-empty">
    <div className="history-empty-icon">◎</div><div><p className="eyebrow">Storico valutativo</p><h3>Nessuna seduta completata</h3><p>Lo storico inizierà a popolarsi dopo il completamento della prima seduta di valutazione.</p></div>
    <button onClick={onCreateEvaluation}>Crea seduta di valutazione</button>
  </section>;

  return <section className="evaluation-history" aria-labelledby="evaluation-history-title">
    <div className="history-head">
      <div><p className="eyebrow">Evidenze nel tempo</p><h3 id="evaluation-history-title">Storico sedute di valutazione</h3><p>Confronti metodologici solo quando parametro, scala e qualità dell’osservazione lo consentono.</p></div>
      <button className="secondary" onClick={onCreateEvaluation}>+ Nuova seduta</button>
    </div>

    <div className="history-overview">
      <article><span>Ultima valutazione</span><strong>{latest ? dateLabel(latest.date) : "—"}</strong></article>
      <article><span>Sedute completate</span><strong>{sessions.length}</strong></article>
      <article><span>Complete</span><strong>{completeSessions.length}</strong></article>
      <article><span>Mirate</span><strong>{sessions.filter(item => item.evaluationType === "Targeted").length}</strong></article>
    </div>
    {recentParameters.length > 0 && <div className="history-focus"><span>Parametri osservati di recente</span><div>{recentParameters.map(item => <small key={item}>{item}</small>)}</div></div>}

    <div className="history-tabs" role="tablist" aria-label="Viste dello storico">
      {([ ["timeline", "Timeline"], ["parameters", "Parametri"], ["profiles", "Profili"], ["comparison", "Confronta"] ] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={view === id} className={view === id ? "active" : ""} onClick={() => setView(id)}>{label}</button>)}
    </div>

    {view !== "comparison" && <div className="history-filters">
      <label><span>Tipo seduta</span><select value={sessionFilter} onChange={event => setSessionFilter(event.target.value as SessionFilter)}><option value="ALL">Tutte</option><option value="Complete">Complete</option><option value="Targeted">Mirate</option><option value="Reassessment">Rivalutazioni</option></select></label>
      <label><span>Profilo</span><select value={profileFilter} onChange={event => setProfileFilter(event.target.value as HistoryProfile | "ALL")}><option value="ALL">Tutti i profili</option>{profiles.map(profile => <option key={profile} value={profile}>{profileLabels[profile]}</option>)}</select></label>
      <label className="history-search"><span>Cerca parametro</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Es. presa alta" /></label>
    </div>}

    {view === "timeline" && <Timeline sessions={filtered} allSessions={sessions} onOpenResults={onOpenResults} onReassess={onReassess} />}
    {view === "parameters" && <ParameterTimelines timelines={timelines} />}
    {view === "profiles" && <Profiles sessions={filtered} />}
    {view === "comparison" && <Comparison sessions={completeSessions} previous={previous} current={current} previousId={previousId} currentId={currentId} setPreviousId={setPreviousId} setCurrentId={setCurrentId} comparison={sessionComparison} />}
  </section>;
}

function Timeline({ sessions, allSessions, onOpenResults, onReassess }: { sessions: GoalkeeperEvaluationHistorySession[]; allSessions: GoalkeeperEvaluationHistorySession[]; onOpenResults: (id: string) => void; onReassess: (id: string) => void }) {
  if (!sessions.length) return <div className="history-no-results">Nessuna seduta corrisponde ai filtri selezionati.</div>;
  return <div className="history-timeline">{sessions.map(session => {
    const reliability = { STRONG: 0, GOOD: 0, LIMITED: 0, INSUFFICIENT: 0 };
    session.parameters.forEach(parameter => { reliability[parameter.reliability] += 1; });
    const baseline = session.baselineSessionId ? allSessions.find(item => item.id === session.baselineSessionId) ?? null : null;
    const chain = session.evaluationType === "Reassessment" ? buildReassessmentChain(allSessions, session.id) : [];
    return <article className="history-session-card" key={session.id}>
      <div className="history-session-date"><time dateTime={session.date}>{dateLabel(session.date)}</time><span>{session.evaluationType === "Complete" ? "Completa" : session.evaluationType === "Targeted" ? "Mirata" : "Rivalutazione"}</span>{baseline && <button className="history-baseline-link" onClick={() => onOpenResults(baseline.id)}>Baseline: {dateLabel(baseline.date)}</button>}</div>
      <div className="history-session-body">
        <div className="history-session-metrics"><span><b>{session.durationMinutes}</b> min</span><span><b>{session.exerciseCount}</b> esercizi</span><span><b>{session.parameters.filter(item => item.state === "EVALUATED").length}</b> valutati</span><span><b>{session.parameters.filter(item => item.state !== "EVALUATED").length}</b> non valutati</span></div>
        <div className="history-session-focus">{session.parameters.slice(0, 5).map(parameter => <small key={parameter.key}>{parameter.name}</small>)}</div>
        <div className="history-reliability-row">{Object.entries(reliability).filter(([, count]) => count > 0).map(([key, count]) => <span key={key} className={`reliability-${key.toLowerCase()}`}>{reliabilityLabels[key as keyof typeof reliabilityLabels]} {count}</span>)}</div>
      </div>
      <div className="history-session-actions"><button className="secondary" onClick={() => onOpenResults(session.id)}>Vedi risultati</button><button onClick={() => onReassess(session.id)}>Rivaluta</button></div>
      {chain.length > 1 && <div className="reassessment-chain"><strong>Percorso valutativo</strong>{chain.map((item, index) => <span key={item.id}>{index > 0 && "→ "}{item.evaluationType === "Reassessment" ? "Rivalutazione" : item.evaluationType === "Complete" ? "Baseline completa" : "Baseline mirata"} · {dateLabel(item.date)}</span>)}</div>}
      {baseline && <BaselineComparison baseline={baseline} reassessment={session} />}
    </article>;
  })}</div>;
}

function BaselineComparison({ baseline, reassessment }: { baseline: GoalkeeperEvaluationHistorySession; reassessment: GoalkeeperEvaluationHistorySession }) {
  const comparison = compareHistorySessions(baseline, reassessment);
  return <details className="baseline-comparison"><summary>Confronto con baseline · {levelLabels[comparison.level]}</summary><div className="baseline-comparison-grid">{comparison.parameterComparisons.map(item => {
    const firstMeasurement = item.previous.weightedScore == null && item.current.weightedScore != null;
    return <article key={item.current.key}><strong>{item.current.name}</strong><div><span>Baseline <b>{scoreLabel(item.previous.weightedScore)}</b><small>{reliabilityLabels[item.previous.reliability]}</small></span><span>Rivalutazione <b>{scoreLabel(item.current.weightedScore)}</b><small>{reliabilityLabels[item.current.reliability]}</small></span></div>{firstMeasurement ? <p>Prima misurazione valida disponibile.</p> : <Delta level={item.comparison.level} delta={item.comparison.delta} />}{item.comparison.level === "LOW_COMPARABILITY" && <p>Risultati mostrati senza giudizio: esercizi o contesti differenti.</p>}</article>;
  })}</div></details>;
}

function ParameterTimelines({ timelines }: { timelines: ReturnType<typeof buildParameterTimelines> }) {
  if (!timelines.length) return <div className="history-no-results">Nessun parametro corrisponde ai filtri selezionati.</div>;
  return <div className="parameter-history-grid">{timelines.map(timeline => <article className="parameter-history-card" key={timeline.key}>
    <header><div><span>{profileLabels[timeline.profile]}</span><h4>{timeline.name}</h4></div><small>{timeline.entries.length} rilevazioni</small></header>
    <div className="parameter-history-points">{timeline.entries.map((entry, index) => {
      const comparison = index ? compareParameterResults(timeline.entries[index - 1], entry) : null;
      return <div className="parameter-history-point" key={entry.sessionId}>
        <time>{dateLabel(entry.date)}</time>
        <div><strong>{entry.state === "EVALUATED" ? scoreLabel(entry.weightedScore) : "—"}</strong><span>{parameterState(entry)}</span><small>Affidabilità {reliabilityLabels[entry.reliability].toLowerCase()}</small></div>
        {comparison && <Delta level={comparison.level} delta={comparison.delta} />}
      </div>;
    })}</div>
  </article>)}</div>;
}

function Profiles({ sessions }: { sessions: GoalkeeperEvaluationHistorySession[] }) {
  return <div className="history-profiles">{profiles.map(profile => {
    const dimensions = sessions.flatMap(session => session.dimensions.filter(dimension => dimension.profile === profile));
    return <section key={profile}><h4>{profileLabels[profile]}</h4>{!dimensions.length ? <p>Nessuna dimensione osservata in questo profilo.</p> : <div className="history-dimension-grid">{[...new Set(dimensions.map(item => item.name))].map(name => {
      const entries = dimensions.filter(item => item.name === name).sort((a, b) => a.date.localeCompare(b.date));
      return <article key={name}><h5>{name}</h5>{entries.map((entry, index) => {
        const comparison = index ? compareDimensionResults(entries[index - 1], entry) : null;
        return <div className="history-dimension-entry" key={entry.sessionId}><time>{dateLabel(entry.date)}</time><strong>{scoreLabel(entry.score)}</strong>{comparison?.compositionChanged && <span title="I parametri che compongono questa dimensione non coincidono completamente">Composizione variata</span>}{comparison && <Delta level={comparison.level} delta={comparison.delta} />}</div>;
      })}</article>;
    })}</div>}</section>;
  })}</div>;
}

function Comparison({ sessions, previous, current, previousId, currentId, setPreviousId, setCurrentId, comparison }: {
  sessions: GoalkeeperEvaluationHistorySession[]; previous: GoalkeeperEvaluationHistorySession | null; current: GoalkeeperEvaluationHistorySession | null;
  previousId: string; currentId: string; setPreviousId: (id: string) => void; setCurrentId: (id: string) => void; comparison: ReturnType<typeof compareHistorySessions> | null;
}) {
  if (sessions.length < 2) return <div className="history-one-session"><h4>Serve una seconda valutazione completa</h4><p>Una sola seduta non permette ancora un confronto nel tempo. I risultati attuali restano disponibili nella Timeline.</p></div>;
  return <div className="history-comparison">
    <div className="history-comparison-selectors">
      <label><span>Valutazione precedente</span><select value={previousId || previous?.id || ""} onChange={event => setPreviousId(event.target.value)}>{sessions.map(item => <option key={item.id} value={item.id}>{dateLabel(item.date)}</option>)}</select></label>
      <span aria-hidden="true">→</span>
      <label><span>Valutazione successiva</span><select value={currentId || current?.id || ""} onChange={event => setCurrentId(event.target.value)}>{sessions.map(item => <option key={item.id} value={item.id}>{dateLabel(item.date)}</option>)}</select></label>
    </div>
    {!comparison ? <div className="history-no-results">Seleziona due sedute differenti.</div> : <>
      <div className={`history-comparison-summary ${comparisonTone(comparison.level)}`}><strong>{levelLabels[comparison.level]}</strong><span>{comparison.commonParameterKeys.length} parametri comuni · sovrapposizione target {Math.round(comparison.targetOverlap * 100)}%</span></div>
      <div className="history-comparison-list">{comparison.parameterComparisons.map(item => <article key={item.previous.key}>
        <div><span>{profileLabels[item.current.profile]}</span><h4>{item.current.name}</h4></div>
        <div className="history-score-pair"><span><small>{dateLabel(item.previous.date)}</small><strong>{scoreLabel(item.previous.weightedScore)}</strong></span><b>→</b><span><small>{dateLabel(item.current.date)}</small><strong>{scoreLabel(item.current.weightedScore)}</strong></span></div>
        <Delta level={item.comparison.level} delta={item.comparison.delta} />
        <details><summary>Perché questo livello di confronto?</summary>{item.comparison.reasons.map(reason => <p key={reason}>✓ {reason}</p>)}{item.comparison.cautions.map(caution => <p className="caution" key={caution}>! {caution}</p>)}</details>
      </article>)}</div>
    </>}
  </div>;
}
