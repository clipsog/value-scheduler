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

/** True when this Lucid task belongs to one of the linked goal refs (main goal = any subIndex under that goal). */
export function lucidTaskMatchesGoalRefs(
  t: LucidTask,
  refs: { goalIndex: number; subIndex: number | null }[],
): boolean {
  if (!refs?.length) return false;
  return refs.some((r) => {
    if (t.goalIndex !== r.goalIndex) return false;
    if (r.subIndex == null) return true;
    return t.subIndex === r.subIndex;
  });
}

/**
 * Calendar UI: if the event links Lucid goals, show tasks for those goals (their `task.date` may not match the block).
 * Otherwise mirror Lucid's day column — tasks on the same local calendar day as `dayAnchor`.
 */
export function lucidTasksForEventDisplay(
  tasks: LucidTask[],
  lucidGoalRefs: { goalIndex: number; subIndex: number | null }[] | undefined,
  dayAnchor: Date,
): LucidTask[] {
  if (lucidGoalRefs?.length) {
    return tasks.filter((t) => lucidTaskMatchesGoalRefs(t, lucidGoalRefs));
  }
  return tasksForLucidDay(tasks, dayAnchor);
}

export function goalLabelForTask(goals: LucidGoal[], t: LucidTask): string {
  const g = goals[t.goalIndex];
  if (!g?.title) return `Goal #${t.goalIndex}`;
  if (t.subIndex == null) return g.title;
  const sub = g.subgoals?.[t.subIndex];
  return sub?.text ? `${g.title} → ${sub.text}` : g.title;
}

export type LucidTaskSubgoalGroup = {
  key: string;
  heading: string;
  tasks: LucidTask[];
};

function lucidSubgoalSectionHeading(goals: LucidGoal[], goalIndex: number, subIndex: number | null): string {
  const g = goals[goalIndex];
  const title = String(g?.title || '').trim();
  if (!title) return `Goal ${goalIndex + 1}`;
  if (subIndex == null) return `${title} · Main`;
  const sub = g.subgoals?.[subIndex];
  const st = String(sub?.text || '').trim();
  return st ? `${title} · ${st}` : `${title} · Key result ${subIndex + 1}`;
}

/** Group open (incomplete) Lucid tasks under goal / subgoal headings for the schedule UI. */
export function groupOpenLucidTasksBySubgoal(openTasks: LucidTask[], goals: LucidGoal[]): LucidTaskSubgoalGroup[] {
  const map = new Map<string, LucidTask[]>();
  for (const t of openTasks) {
    const subKey = t.subIndex === null || t.subIndex === undefined ? 'main' : String(t.subIndex);
    const key = `${t.goalIndex}__${subKey}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  const entries = [...map.entries()].sort((a, b) => {
    const [ga, sa] = a[0].split('__');
    const [gb, sb] = b[0].split('__');
    const cmpG = Number(ga) - Number(gb);
    if (cmpG !== 0) return cmpG;
    if (sa === 'main' && sb !== 'main') return -1;
    if (sa !== 'main' && sb === 'main') return 1;
    if (sa === 'main' && sb === 'main') return 0;
    return Number(sa) - Number(sb);
  });
  return entries.map(([key, tasks]) => {
    const [gi, sk] = key.split('__');
    const goalIndex = Number(gi);
    const subIndex = sk === 'main' ? null : Number(sk);
    return {
      key,
      heading: lucidSubgoalSectionHeading(goals, goalIndex, subIndex),
      tasks,
    };
  });
}

export type LucidGoalPickOption = {
  ref: { goalIndex: number; subIndex: number | null };
  label: string;
};

export function lucidGoalRefKey(ref: { goalIndex: number; subIndex: number | null }): string {
  return `${ref.goalIndex}-${ref.subIndex === null ? 'main' : ref.subIndex}`;
}

/** Top-level Lucid goals only (no subgoals / key results). */
export function buildLucidGoalPickOptions(goals: LucidGoal[]): LucidGoalPickOption[] {
  const out: LucidGoalPickOption[] = [];
  (goals || []).forEach((g, gi) => {
    const title = String(g?.title || '').trim();
    if (!title) return;
    out.push({ ref: { goalIndex: gi, subIndex: null }, label: title });
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
