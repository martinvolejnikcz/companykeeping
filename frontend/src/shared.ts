export interface WorkspaceInfo {
  id: string;
  name: string;
  country: string;
  description: string;
  stage: 'forming' | 'operating';
  setupComplete: boolean;
}

export interface ItemInput {
  title: string;
  why?: string;
  nextAction?: string;
  status?: 'ready' | 'waiting' | 'done';
  waitingFor?: string;
  dueDate?: string | null;
  followUpDate?: string | null;
  evidenceUrl?: string;
  sourceUrl?: string;
  recurrence?: 'none' | 'monthly';
  period?: string | null;
}

export interface Item extends Required<ItemInput> {
  id: string;
  seriesId: string | null;
  completedAt: string | null;
}

export interface State {
  user: {email: string} | null;
  workspace: WorkspaceInfo | null;
  items: Item[];
  suggestions: ItemInput[];
}

export type Profile = Pick<WorkspaceInfo, 'name' | 'country' | 'description' | 'stage'>;
export interface Example { workspace: Profile; suggestions: ItemInput[] }

export async function api<T = unknown>(path: string, method = 'GET', data?: unknown): Promise<T> {
  const options: RequestInit = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (method !== 'GET') {
    options.headers = { ...options.headers, 'Content-Type': 'application/json' };
    options.body = JSON.stringify(data ?? {});
  }
  let response: Response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error('Connection lost. Check your connection and try again.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Your request could not be saved. Try again.');
  return result as T;
}

export function message(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
