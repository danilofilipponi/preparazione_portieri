"use client";

import type { CalendarDay, Training } from "../../lib/types";
import { matchDayLabel } from "../../lib/season-calendar";

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
const dayNames = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function SeasonAgenda({ calendarDays, trainings, weekStart, setWeekStart, onOpenTraining, onOpenDay, onCreate, onSettings }: { calendarDays: CalendarDay[]; trainings: Training[]; weekStart: Date; setWeekStart: (date: Date) => void; onOpenTraining: (training: Training) => void; onOpenDay: (day: CalendarDay) => void; onCreate: () => void; onSettings: () => void }) {
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(date.getDate() + index); return date; });
  const shift = (amount: number) => { const next = new Date(weekStart); next.setDate(next.getDate() + amount); setWeekStart(next); };
  const activePhase = calendarDays.find(item => days.some(day => dateKey(day) === item.data))?.phase?.tipo;
  return <>
    <div className="page-head agenda-head"><div><div className="eyebrow">{activePhase ? `Settimana ${activePhase}` : "Settimana corrente"}</div><h1>Agenda settimanale</h1><p className="subtitle">Allenamenti, gare, riposo e riferimenti Match Day.</p></div><div className="page-actions"><button className="secondary" onClick={onSettings}>⚙ Impostazioni stagione</button><button className="primary" onClick={onCreate}>+ Crea allenamento</button></div></div>
    <div className="week-controls"><button onClick={() => shift(-7)}>←</button><strong>{days[0].toLocaleDateString("it-IT", { day: "numeric", month: "short" })} – {days[6].toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}</strong><button onClick={() => shift(7)}>→</button></div>
    <div className="week-grid season-week-grid">{days.map((date, index) => {
      const key = dateKey(date); const day = calendarDays.find(item => item.data === key); const daily = trainings.filter(item => item.training_date === key); const today = key === dateKey(new Date());
      return <article className={`day season-day ${today ? "today" : ""} ${day ? `type-${day.tipo_giornata.toLowerCase().replaceAll(" ", "-")}` : ""}`} key={key}>
        <button className="season-day-main" onClick={() => day && onOpenDay(day)} disabled={!day}><div className="day-head"><span className="day-name">{dayNames[index]}</span><span className="day-number">{date.getDate()}</span></div>{day ? <><span className="day-type-badge">{day.tipo_giornata}</span><div className="season-day-meta">{matchDayLabel(day.match_day_offset) && <strong>{matchDayLabel(day.match_day_offset)}</strong>}{day.phase && <span>{day.phase.tipo}</span>}{day.richiamo_atletico && <em>Richiamo atletico</em>}{day.carico_previsto && <span>Carico {day.carico_previsto}</span>}</div></> : <div className="empty-day">Agenda non generata</div>}</button>
        {daily.map(training => <button className={`workout ${training.content_status === "empty" ? "empty-workout" : ""} ${training.evaluation_session ? "evaluation-workout" : ""}`} key={training.id} onClick={() => onOpenTraining(training)}>{training.evaluation_session ? <span className="evaluation-agenda-badges"><b>VALUTAZIONE</b><em>{training.evaluation_session.status === "Completed" ? "COMPLETATA" : training.evaluation_session.evaluation_type === "Complete" ? "Completa" : training.evaluation_session.evaluation_type === "Targeted" ? "Mirata" : training.evaluation_session.evaluation_type === "Custom" ? "Personalizzata" : "Rivalutazione"}</em></span> : <span>{training.content_status === "empty" ? "Seduta vuota programmata" : "Seduta programmata"}</span>}<strong>{training.session_type || training.training_objectives.map(item => item.objective).join(" · ") || "Allenamento portieri"}</strong><span>{training.planned_duration_minutes} min · {training.goalkeeper_count} portieri</span></button>)}
      </article>;
    })}</div>
  </>;
}
