"use client";

type Props = {
  date: string;
  matchDay: string;
  seasonPhase: string;
  duration: number;
  load: string;
  goalkeeperCount: number;
  technicalPrimary: string;
  technicalSecondary?: string | null;
  physicalPrimary: string;
  goalkeeperNames: string[];
  quality?: number | null;
  onFieldMode: () => void;
};

export function SessionOverviewHeader(props: Props) {
  const dateLabel = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" })
    .format(new Date(`${props.date}T12:00:00`));
  return <header className="session-overview-header">
    <div className="session-overview-title">
      <div><span className="session-date">{dateLabel}</span><strong className="session-md">{props.matchDay}</strong></div>
      <button className="field-mode-launch" onClick={props.onFieldMode} aria-label="Apri modalità campo">Modalità campo</button>
    </div>
    <div className="session-overview-facts">
      <div><small>Fase stagione</small><strong>{props.seasonPhase}</strong></div>
      <div><small>Durata</small><strong>{props.duration} min</strong></div>
      <div><small>Carico</small><strong>{props.load}</strong></div>
      <div><small>Portieri</small><strong>{props.goalkeeperCount}</strong></div>
      {props.quality !== null && props.quality !== undefined && <div className="session-coherence"><small>Coerenza</small><strong>{props.quality}/100</strong></div>}
    </div>
    <div className="session-focus-grid">
      <div><small>Focus tecnico</small><strong>{props.technicalPrimary || "Non specificato"}</strong></div>
      {props.technicalSecondary && <div><small>Focus secondario</small><strong>{props.technicalSecondary}</strong></div>}
      <div className="physical"><small>Focus fisico</small><strong>{props.physicalPrimary || "Non specificato"}</strong></div>
    </div>
    {props.goalkeeperNames.length > 0 && <div className="session-goalkeepers"><small>Portieri presenti</small><span>{props.goalkeeperNames.join(" · ")}</span></div>}
  </header>;
}
