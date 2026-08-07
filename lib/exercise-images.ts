import { supabase } from "./supabase";

export type ExerciseImageKind = "schema" | "foto";

const acceptedExtensions = new Set(["webp", "jpg", "jpeg", "png"]);
const acceptedTypes = new Set(["image/webp", "image/jpeg", "image/png"]);

export function parseExerciseImageName(filename: string): { codice: string; kind: ExerciseImageKind } | null {
  const match = filename.trim().match(/^([a-z0-9-]+)_(schema|foto)\.(webp|jpe?g|png)$/i);
  if (!match) return null;
  return { codice: match[1].toUpperCase(), kind: match[2].toLowerCase() as ExerciseImageKind };
}

export function isAcceptedExerciseImage(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return acceptedExtensions.has(extension) && (!file.type || acceptedTypes.has(file.type));
}

export function exerciseImagePath(codice: string, kind: ExerciseImageKind) {
  const normalized = codice.trim().toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(normalized)) throw new Error("Codice esercizio non valido per lo Storage");
  return `${normalized}/${kind}.webp`;
}

function pathFromPublicUrl(url: string | null) {
  if (!url) return null;
  const marker = "/storage/v1/object/public/exercise-images/";
  const index = url.indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
}

async function convertToWebp(file: File): Promise<Blob> {
  if (file.type === "image/webp" || file.name.toLowerCase().endsWith(".webp")) return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Conversione immagine non disponibile");
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.9));
    if (!blob) throw new Error("Conversione in WEBP non riuscita");
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function uploadExerciseImage(codice: string, kind: ExerciseImageKind, file: File, currentUrl: string | null) {
  if (!supabase) throw new Error("Supabase non configurato");
  if (!isAcceptedExerciseImage(file)) throw new Error("Formato non supportato: usa WEBP, JPG, JPEG o PNG");
  const path = exerciseImagePath(codice, kind);
  const webp = await convertToWebp(file);
  const { error } = await supabase.storage.from("exercise-images").upload(path, webp, {
    upsert: true,
    contentType: "image/webp",
    cacheControl: "0",
  });
  if (error) throw error;

  const previousPath = pathFromPublicUrl(currentUrl);
  if (previousPath && previousPath !== path) await supabase.storage.from("exercise-images").remove([previousPath]);
  const publicUrl = supabase.storage.from("exercise-images").getPublicUrl(path).data.publicUrl;
  return `${publicUrl}?v=${Date.now()}`;
}

export async function deleteExerciseImage(codice: string, kind: ExerciseImageKind, currentUrl: string | null) {
  if (!supabase) throw new Error("Supabase non configurato");
  const paths = new Set([exerciseImagePath(codice, kind)]);
  const previousPath = pathFromPublicUrl(currentUrl);
  if (previousPath) paths.add(previousPath);
  const { error } = await supabase.storage.from("exercise-images").remove([...paths]);
  if (error) throw error;
}
