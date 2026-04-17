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

export function isLucidConfigured(): boolean {
  const url = import.meta.env.VITE_LUCID_SUPABASE_URL?.trim();
  const key = import.meta.env.VITE_LUCID_SUPABASE_ANON_KEY?.trim();
  return Boolean(url && key);
}

export function createLucidClient(): SupabaseClient | null {
  if (!isLucidConfigured()) return null;
  return createClient(
    import.meta.env.VITE_LUCID_SUPABASE_URL as string,
    import.meta.env.VITE_LUCID_SUPABASE_ANON_KEY as string,
  );
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
  const { data, error } = await sb
    .from(LUCID_TABLE)
    .select('goals,tasks,deleted_task_ids,deleted_task_keys,prayers')
    .eq('id', LUCID_ROW_ID)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    goals: Array.isArray(data.goals) ? (data.goals as LucidGoal[]) : [],
    tasks: Array.isArray(data.tasks) ? (data.tasks as LucidTask[]) : [],
    deleted_task_ids: Array.isArray(data.deleted_task_ids)
      ? data.deleted_task_ids.map(String)
      : [],
    deleted_task_keys: Array.isArray(data.deleted_task_keys)
      ? data.deleted_task_keys.map(String)
      : [],
    prayers: Array.isArray(data.prayers) ? data.prayers : [],
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
  if (!sb) throw new Error('Lucid is not configured (set VITE_LUCID_SUPABASE_URL and VITE_LUCID_SUPABASE_ANON_KEY).');

  const { data: row, error } = await sb
    .from(LUCID_TABLE)
    .select('goals,tasks,deleted_task_ids,deleted_task_keys,prayers')
    .eq('id', LUCID_ROW_ID)
    .single();
  if (error) throw error;

  const goals = Array.isArray(row.goals) ? ([...row.goals] as LucidGoal[]) : [];
  const tasks: LucidTask[] = Array.isArray(row.tasks) ? [...(row.tasks as LucidTask[])] : [];
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

  const payload = {
    id: LUCID_ROW_ID,
    goals,
    tasks,
    prayers: Array.isArray(row.prayers) ? row.prayers : [],
    deleted_task_ids: Array.isArray(row.deleted_task_ids) ? row.deleted_task_ids : [],
    deleted_task_keys: Array.isArray(row.deleted_task_keys) ? row.deleted_task_keys : [],
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await sb.from(LUCID_TABLE).upsert(payload, { onConflict: 'id' });
  if (upErr) throw upErr;
}
