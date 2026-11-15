import { supabase } from "./supabase";
import type { Doc } from "./projects";

export const BUCKET = "crm-files";

/** Shrink phone photos to about 200 KB: longest side 1600 px, JPEG quality 0.72. PDFs pass through. */
export async function compressImage(file: File, maxSide = 1600, quality = 0.72): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  return blob && blob.size < file.size ? blob : file;
}

const safeName = (n: string) => n.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(-60) || "file";

/** Upload one file (compressed) and record it as a document. New uploads never overwrite: each is a new version. */
export async function uploadDocument(opts: { projectId?: string | null; leadId?: string | null; docTypeId: number; file: File }) {
  const { projectId, leadId, docTypeId, file } = opts;
  if (file.size > 25 * 1024 * 1024) throw new Error("That file is too large. Please choose one under 25 MB.");
  const body = await compressImage(file);
  const isJpeg = body !== file;
  const name = isJpeg ? safeName(file.name).replace(/\.\w+$/, "") + ".jpg" : safeName(file.name);
  const folder = projectId ? `projects/${projectId}` : `leads/${leadId}`;
  const path = `${folder}/${docTypeId}-${Date.now().toString(36)}-${name}`;
  const type = isJpeg ? "image/jpeg" : file.type || "application/octet-stream";
  if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(type)) throw new Error("Please upload a photo (JPG, PNG) or a PDF.");
  if (body.size > 10 * 1024 * 1024) throw new Error("That file is over 10 MB even after compressing. Please upload a smaller PDF.");
  const up = await supabase.storage.from(BUCKET).upload(path, body, { contentType: type, upsert: false });
  if (up.error) throw up.error;
  const { data, error } = await supabase.from("documents").insert({
    project_id: projectId ?? null, lead_id: leadId ?? null, doc_type_id: docTypeId,
    file_path: path, file_name: file.name, mime_type: type, size_bytes: body.size,
  }).select().single();
  if (error) throw error;
  return data as Doc;
}

export async function signedUrl(path: string, download?: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600, download ? { download } : undefined);
  if (error) throw error;
  return data.signedUrl;
}

export async function signedUrls(paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;
  return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl])) as Record<string, string>;
}

/** Download every document as one ZIP, organised by document type. */
export async function downloadZip(zipName: string, docs: Doc[], typeName: (id: number) => string, onProgress?: (done: number, total: number) => void) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  let done = 0;
  for (const d of docs) {
    const { data, error } = await supabase.storage.from(BUCKET).download(d.file_path);
    if (error) throw error;
    const ext = d.file_path.split(".").pop();
    const base = `${typeName(d.doc_type_id)}${d.version > 1 ? ` v${d.version}` : ""}`.replace(/[\\/:*?"<>|]/g, "-");
    zip.file(`${base}.${ext}`, data);
    onProgress?.(++done, docs.length);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `${zipName}.zip`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export const fmtSize = (b: number | null) => (b == null ? "" : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
