/**
 * Read/write Lucid (Goal Achiever) cloud state: {@link https://github.com/clipsog/Goalachiever clipsog/Goalachiever}
 * Table `goal_app_state`, row id `goal-achiever-main` — same contract as `goal achiever.html`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const LUCID_ROW_ID = 'goal-achiever-main';
export const LUCID_TABLE = 'goal_app_state';

export type LucidGoal = {
  title: string;
  purpose?: string;
  color?: string;
  subgoals?: { text: string; history?: unknown[] }[];
};

export type LucidTask = {
  tid?: string;
  text: string;
  goalIndex: number;
  subIndex: number | null;
  date: string;
  done: boolean;
  completedDate?: string | null;
  completedAt?: string | null;
  blockedByTid?: string | null;
};

/** Lucid-specific vars, or the same-project fallback used by the rest of the app. */
function lucidResolvedUrl(): string {
  return (
    import.meta.env.VITE_LUCID_SUPABASE_URL?.trim() ||
    import.meta.env.VITE_SUPABASE_URL?.trim() ||
    ''
  );
}

function lucidResolvedAnonKey(): string {
  return (
    import.meta.env.VITE_LUCID_SUPABASE_ANON_KEY?.trim() ||
    import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    ''
  );
}

export function isLucidConfigured(): boolean {
  return Boolean(lucidResolvedUrl() && lucidResolvedAnonKey());
}

export function createLucidClient(): SupabaseClient | null {
  const url = lucidResolvedUrl();
  const key = lucidResolvedAnonKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'sb-lucid-goal-app',
    },
  });
}

/** Same calendar-day key Lucid uses (`Date.toDateString()`). */
export function lucidDayKey(d: Date): string {
  return d.toDateString();
}

export function isTaskOnLucidDay(task: LucidTask, dayAnchor: Date): boolean {
  const a = new Date(dayAnchor);
  const b = new Date(task.date);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) {
    return String(task.date) === lucidDayKey(dayAnchor);
  }
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Mirrors `getCompletionISOForCurrentDate` in Lucid for the selected calendar day. */
export function getCompletionISOForLucidDay(dayAnchor: Date): string {
  const todayKey = new Date().toDateString();
  if (lucidDayKey(dayAnchor) === todayKey) {
    return new Date().toISOString();
  }
  const noon = new Date(dayAnchor);
  noon.setHours(12, 0, 0, 0);
  return noon.toISOString();
}

export type LucidCloudRow = {
  goals: LucidGoal[];
  tasks: LucidTask[];
  deleted_task_ids: string[];
  deleted_task_keys: string[];
  prayers: unknown[];
};

export async function fetchLucidState(): Promise<LucidCloudRow | null> {
  const sb = createLucidClient();
  if (!sb) return null;
  // Use * so older goal_app_state rows (missing tombstone/prayer columns) still load.
  const { data, error } = await sb.from(LUCID_TABLE).select('*').eq('id', LUCID_ROW_ID).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const d = data as Record<string, unknown>;
  return {
    goals: Array.isArray(d.goals) ? (d.goals as LucidGoal[]) : [],
    tasks: Array.isArray(d.tasks) ? (d.tasks as LucidTask[]) : [],
    deleted_task_ids: Array.isArray(d.deleted_task_ids) ? (d.deleted_task_ids as string[]).map(String) : [],
    deleted_task_keys: Array.isArray(d.deleted_task_keys) ? (d.deleted_task_keys as string[]).map(String) : [],
    prayers: Array.isArray(d.prayers) ? d.prayers : [],
  };
}

export function tasksForLucidDay(tasks: LucidTask[], dayAnchor: Date): LucidTask[] {
  return tasks.filter((t) => isTaskOnLucidDay(t, dayAnchor));
}

export function goalLabelForTask(goals: LucidGoal[], t: LucidTask): string {
  const g = goals[t.goalIndex];
  if (!g?.title) return `Goal #${t.goalIndex}`;
  if (t.subIndex == null) return g.title;
  const sub = g.subgoals?.[t.subIndex];
  return sub?.text ? `${g.title} → ${sub.text}` : g.title;
}

export type LucidGoalPickOption = {
  ref: { goalIndex: number; subIndex: number | null };
  label: string;
};

export function lucidGoalRefKey(ref: { goalIndex: number; subIndex: number | null }): string {
  return `${ref.goalIndex}-${ref.subIndex === null ? 'main' : ref.subIndex}`;
}

/** Flat list: whole goal + each subgoal, for multi-select in the scheduler. */
export function buildLucidGoalPickOptions(goals: LucidGoal[]): LucidGoalPickOption[] {
  const out: LucidGoalPickOption[] = [];
  (goals || []).forEach((g, gi) => {
    const title = String(g?.title || '').trim();
    if (!title) return;
    out.push({ ref: { goalIndex: gi, subIndex: null }, label: title });
    (g.subgoals || []).forEach((s, si) => {
      const st = String(s?.text || '').trim();
      if (st) out.push({ ref: { goalIndex: gi, subIndex: si }, label: `${title} → ${st}` });
    });
  });
  return out;
}

/**
 * Toggle one task's `done` flag and upsert the full row (same shape as Lucid's push).
 * Respects `blockedByTid` when marking complete.
 */
export async function toggleLucidTaskDone(tid: string, dayAnchor: Date): Promise<void> {
  const sb = createLucidClient();
  if (!sb) {
    throw new Error(
      'Lucid is not configured (set VITE_LUCID_SUPABASE_* or VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY at build time).',
    );
  }

  const { data: row, error } = await sb.from(LUCID_TABLE).select('*').eq('id', LUCID_ROW_ID).single();
  if (error) throw error;

  const r = row as Record<string, unknown>;
  const goals = Array.isArray(r.goals) ? ([...r.goals] as LucidGoal[]) : [];
  const tasks: LucidTask[] = Array.isArray(r.tasks) ? [...(r.tasks as LucidTask[])] : [];
  const idx = tasks.findIndex((t) => String(t.tid) === String(tid));
  if (idx === -1) throw new Error('Task not found in Lucid cloud state.');

  const cur = { ...tasks[idx] } as LucidTask;
  const nextDone = !cur.done;

  if (nextDone) {
    const pre = cur.blockedByTid;
    if (pre) {
      const blocker = tasks.find((x) => String(x.tid) === String(pre));
      if (blocker && !blocker.done) {
        throw new Error('Complete the bottleneck task first.');
      }
    }
  }

  cur.done = nextDone;
  if (cur.done) {
    cur.completedDate = lucidDayKey(dayAnchor);
    cur.completedAt = getCompletionISOForLucidDay(dayAnchor);
  } else {
    cur.completedDate = null;
    cur.completedAt = null;
  }
  tasks[idx] = cur;

  const payload: Record<string, unknown> = {
    id: LUCID_ROW_ID,
    goals,
    tasks,
    updated_at: new Date().toISOString(),
  };
  for (const k of ['prayers', 'deleted_task_ids', 'deleted_task_keys'] as const) {
    if (Object.prototype.hasOwnProperty.call(r, k) && r[k] !== undefined) {
      payload[k] = r[k];
    }
  }

  const { error: upErr } = await sb.from(LUCID_TABLE).upsert(payload, { onConflict: 'id' });
  if (upErr) throw upErr;
}
