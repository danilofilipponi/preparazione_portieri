"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { ExerciseImageKind } from "../../lib/exercise-images";

const acceptedImages = "image/webp,image/jpeg,image/png,.webp,.jpg,.jpeg,.png";

export function ExerciseImageField({ label, kind, url, selectedFile, busy, immediate, onSelect, onUpload, onDelete }: {
  label: string;
  kind: ExerciseImageKind;
  url: string | null;
  selectedFile: File | null;
  busy: boolean;
  immediate: boolean;
  onSelect: (file: File | null) => void;
  onUpload: (file: File) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const inputId = useId();
  const preview = useMemo(() => selectedFile ? URL.createObjectURL(selectedFile) : url, [selectedFile, url]);
  useEffect(() => () => { if (selectedFile && preview) URL.revokeObjectURL(preview); }, [selectedFile, preview]);

  async function choose(file: File | null) {
    if (!file) return;
    if (immediate) {
      try { await onUpload(file); } catch { /* Il contenitore mostra già il messaggio di errore. */ }
    }
    else onSelect(file);
  }

  return <div className={`exercise-image-field ${kind}`}>
    <div className="exercise-image-head"><div><span>{kind === "schema" ? "⌗" : "◉"}</span><strong>{label}</strong></div><small>{kind}.webp</small></div>
    <div className={`exercise-image-preview ${preview ? "has-image" : ""}`}>{preview ? <img src={preview} alt={`Anteprima ${label.toLowerCase()}`} /> : <><span>▧</span><p>Nessuna immagine caricata</p></>}</div>
    <div className="exercise-image-actions">
      <input id={inputId} hidden type="file" accept={acceptedImages} disabled={busy} onChange={event => { void choose(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} />
      <label className="button secondary" htmlFor={inputId}>{busy ? "Caricamento…" : preview ? "Sostituisci immagine" : "Carica immagine"}</label>
      {(preview || selectedFile) && <button type="button" className="danger-link" disabled={busy} onClick={() => void onDelete()}>Elimina immagine</button>}
    </div>
    {!immediate && selectedFile && <small className="pending-image">Sarà caricata quando salvi l’esercizio.</small>}
  </div>;
}

export type BulkImageSummary = {
  total: number;
  processed: number;
  schemas: number;
  photos: number;
  errors: string[];
};

const emptySummary: BulkImageSummary = { total: 0, processed: 0, schemas: 0, photos: 0, errors: [] };

export function BulkImageImportModal({ onClose, onImport }: {
  onClose: () => void;
  onImport: (files: File[], onProgress: (summary: BulkImageSummary) => void) => Promise<BulkImageSummary>;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<BulkImageSummary>(emptySummary);

  async function start() {
    if (!files.length) return;
    setRunning(true);
    try {
      const result = await onImport(files, setSummary);
      setSummary(result);
    } finally { setRunning(false); }
  }

  const percentage = summary.total ? Math.round(summary.processed / summary.total * 100) : 0;
  return <div className="modal-backdrop"><div className="modal bulk-image-modal">
    <button type="button" className="modal-close" disabled={running} onClick={onClose}>×</button>
    <span className="eyebrow">Catalogo esercizi</span><h2>Importa immagini</h2>
    <p>Seleziona insieme file nominati, ad esempio, <b>GK-PRA-012_schema.webp</b> e <b>GK-PRA-012_foto.jpg</b>.</p>
    <label className="bulk-dropzone"><input type="file" multiple accept={acceptedImages} disabled={running} onChange={event => { setFiles(Array.from(event.target.files ?? [])); setSummary(emptySummary); }} /><span>▧</span><strong>Seleziona immagini</strong><small>WEBP, JPG, JPEG o PNG</small></label>
    {files.length > 0 && <div className="bulk-selected"><strong>{files.length} file selezionati</strong><span>{files.slice(0, 3).map(file => file.name).join(" · ")}{files.length > 3 ? ` · +${files.length - 3}` : ""}</span></div>}
    {(running || summary.processed > 0) && <div className="bulk-progress"><div className="bulk-progress-head"><span>Avanzamento</span><b>{summary.processed}/{summary.total} · {percentage}%</b></div><progress max={summary.total || 1} value={summary.processed} /></div>}
    {summary.processed > 0 && !running && <div className="bulk-summary"><div><small>File elaborati</small><strong>{summary.processed}</strong></div><div><small>Schemi caricati</small><strong>{summary.schemas}</strong></div><div><small>Foto caricate</small><strong>{summary.photos}</strong></div><div className={summary.errors.length ? "has-errors" : ""}><small>Errori</small><strong>{summary.errors.length}</strong></div></div>}
    {summary.errors.length > 0 && <div className="bulk-errors"><strong>File non importati</strong><ul>{summary.errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul></div>}
    <div className="modal-actions"><button type="button" className="secondary" disabled={running} onClick={onClose}>{summary.processed ? "Chiudi" : "Annulla"}</button><button type="button" className="primary" disabled={running || !files.length} onClick={() => void start()}>{running ? "Importazione…" : "Avvia importazione"}</button></div>
  </div></div>;
}
