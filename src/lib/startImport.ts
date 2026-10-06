import { IMPORT_ERRORS } from './core/labels';

export interface ImportRequest {
  programId: string;
  mode: 'link' | 'text' | 'screenshot';
  url?: string;
  text?: string;
  paths?: string[]; // storage paths "<user_id>/<file>" in the "imports" bucket
  refresh?: boolean;
}

export async function startImport(body: ImportRequest): Promise<{ importId: string } | { error: string }> {
  try {
    const res = await fetch('/api/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { importId?: string; error?: string };
    if (!res.ok || !json.importId) return { error: IMPORT_ERRORS[json.error ?? ''] ?? IMPORT_ERRORS.default };
    return { importId: json.importId };
  } catch {
    return { error: IMPORT_ERRORS.default };
  }
}
