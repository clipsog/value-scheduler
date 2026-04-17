import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { v4 as uuidv4 } from 'uuid';
import { useAppData } from '../context/AppDataContext';
import type { Event as AppEvent, EventTask, LucidGoalRef } from '../context/AppDataContext';
import { Plus, UserPlus, Briefcase, MapPin, ListChecks, Trash2, Sparkles } from 'lucide-react';
import {
  buildLucidGoalPickOptions,
  fetchLucidState,
  goalLabelForTask,
  isLucidConfigured,
  lucidDayKey,
  lucidGoalRefKey,
  tasksForLucidDay,
  toggleLucidTaskDone,
  type LucidGoal,
  type LucidTask,
} from '../lib/lucidGoalState';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, addDays, addWeeks, addMonths } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

const ScheduleView = () => {
  const { data, addEvent, updateEvent } = useAppData();
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState<Partial<AppEvent>>({
    title: '', date: new Date().toISOString().slice(0, 16), endDate: new Date(Date.now() + 3600000).toISOString().slice(0, 16), moneySpent: 0, moneyEarned: 0, contactIds: [], assetIds: [], placeIds: [], recurrence: 'none', tasks: [], lucidGoalRefs: [],
  });

  const [lucidGoals, setLucidGoals] = useState<LucidGoal[]>([]);
  const [lucidDayTasks, setLucidDayTasks] = useState<LucidTask[]>([]);
  const [lucidLoading, setLucidLoading] = useState(false);
  const [lucidError, setLucidError] = useState<string | null>(null);
  const [lucidTogglingTid, setLucidTogglingTid] = useState<string | null>(null);

  const lucidEnabled = isLucidConfigured();

  const lucidPickOptions = useMemo(() => buildLucidGoalPickOptions(lucidGoals), [lucidGoals]);

  useEffect(() => {
    if (!showModal || !lucidEnabled || !newEvent.date) return;
    let cancelled = false;
    (async () => {
      setLucidLoading(true);
      setLucidError(null);
      try {
        const row = await fetchLucidState();
        if (cancelled) return;
        if (!row) {
          setLucidGoals([]);
          setLucidDayTasks([]);
          setLucidError(
            'No Lucid row in Supabase yet. Open Lucid once and sync so goal_app_state has id goal-achiever-main.',
          );
          return;
        }
        const day = new Date(newEvent.date as string);
        setLucidGoals(row.goals);
        setLucidDayTasks(tasksForLucidDay(row.tasks, day));
      } catch (e) {
        if (!cancelled) {
          setLucidGoals([]);
          setLucidDayTasks([]);
          setLucidError(String((e as Error)?.message ?? e));
        }
      } finally {
        if (!cancelled) setLucidLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showModal, lucidEnabled, newEvent.date]);

  const handleLucidToggle = async (t: LucidTask) => {
    if (!t.tid) {
      setLucidError('This Lucid task has no tid yet — open Lucid and save once so tasks get stable ids.');
      return;
    }
    setLucidError(null);
    setLucidTogglingTid(String(t.tid));
    try {
      const day = new Date(newEvent.date as string);
      await toggleLucidTaskDone(String(t.tid), day);
      const row = await fetchLucidState();
      if (row) {
        setLucidGoals(row.goals);
        setLucidDayTasks(tasksForLucidDay(row.tasks, day));
      }
    } catch (e) {
      setLucidError(String((e as Error)?.message ?? e));
    } finally {
      setLucidTogglingTid(null);
    }
  };

  const openForm = (initialData: Partial<AppEvent> = {}) => {
    const copiedTasks = Array.isArray(initialData.tasks)
      ? initialData.tasks.map((t) => ({ ...t }))
      : [];
    const copiedRefs = Array.isArray(initialData.lucidGoalRefs)
      ? initialData.lucidGoalRefs.map((r) => ({
          goalIndex: r.goalIndex,
          subIndex: r.subIndex === undefined ? null : r.subIndex,
        }))
      : [];
    setNewEvent({
      title: '', date: new Date().toISOString().slice(0, 16), endDate: new Date(Date.now() + 3600000).toISOString().slice(0, 16), moneySpent: 0, moneyEarned: 0, contactIds: [], assetIds: [], placeIds: [], recurrence: 'none',
      ...initialData,
      tasks: copiedTasks,
      lucidGoalRefs: copiedRefs,
    });
    setEditingId(initialData.id || null);
    setShowModal(true);
  };

  const handleSave = () => {
    if (newEvent.title) {
      let startD = new Date(newEvent.date as string);
      let endD = new Date(newEvent.endDate as string);
      
      // Auto-correct if user accidentally picked an end time BEFORE start time on the same date (e.g. overnight sleep)
      if (endD <= startD) {
        endD = new Date(endD.getTime() + 24 * 60 * 60 * 1000);
      }

      const tasks = (newEvent.tasks || [])
        .map((t) => ({ ...t, label: t.label.trim() }))
        .filter((t) => t.label.length > 0);

      const lucidGoalRefs = Array.isArray(newEvent.lucidGoalRefs) ? [...newEvent.lucidGoalRefs] : [];

      const payload = {
        ...newEvent,
        date: startD.toISOString(),
        endDate: endD.toISOString(),
        tasks,
        lucidGoalRefs,
      };
      
      if (editingId) {
        updateEvent(editingId, payload);
      } else {
        addEvent(payload as Omit<AppEvent, 'id'>);
      }
      setShowModal(false);
    }
  };

  const toggleContact = (cId: string) => {
    const ids = newEvent.contactIds || [];
    setNewEvent({ ...newEvent, contactIds: ids.includes(cId) ? ids.filter(id => id !== cId) : [...ids, cId] });
  };

  const toggleAsset = (aId: string) => {
    const ids = newEvent.assetIds || [];
    setNewEvent({ ...newEvent, assetIds: ids.includes(aId) ? ids.filter(id => id !== aId) : [...ids, aId] });
  };

  const togglePlace = (pId: string) => {
    const ids = newEvent.placeIds || [];
    setNewEvent({
      ...newEvent,
      placeIds: ids.includes(pId) ? ids.filter((id) => id !== pId) : [...ids, pId],
    });
  };

  const addTaskRow = () => {
    const tasks = [...(newEvent.tasks || []), { id: uuidv4(), label: '', done: false } satisfies EventTask];
    setNewEvent({ ...newEvent, tasks });
  };

  const patchTask = (taskId: string, patch: Partial<EventTask>) => {
    const tasks = (newEvent.tasks || []).map((row) => (row.id === taskId ? { ...row, ...patch } : row));
    const assetIds = new Set([...(newEvent.assetIds || [])]);
    if (patch.assetId) assetIds.add(patch.assetId);
    const next = { ...newEvent, tasks, assetIds: [...assetIds] };
    setNewEvent(next);
    if (editingId) {
      updateEvent(editingId, { tasks, assetIds: [...assetIds] });
    }
  };

  const toggleTaskDone = (taskId: string) => {
    const tasks = (newEvent.tasks || []).map((row) =>
      row.id === taskId ? { ...row, done: !row.done } : row,
    );
    setNewEvent({ ...newEvent, tasks });
    if (editingId) {
      updateEvent(editingId, { tasks });
    }
  };

  const removeTask = (taskId: string) => {
    const tasks = (newEvent.tasks || []).filter((row) => row.id !== taskId);
    setNewEvent({ ...newEvent, tasks });
    if (editingId) {
      updateEvent(editingId, { tasks });
    }
  };

  const toggleLucidGoalRef = (ref: LucidGoalRef) => {
    const refs = newEvent.lucidGoalRefs || [];
    const k = lucidGoalRefKey(ref);
    const has = refs.some((x) => lucidGoalRefKey(x) === k);
    const lucidGoalRefs = has ? refs.filter((x) => lucidGoalRefKey(x) !== k) : [...refs, ref];
    setNewEvent({ ...newEvent, lucidGoalRefs });
    if (editingId) {
      updateEvent(editingId, { lucidGoalRefs });
    }
  };

  const handleSelectSlot = (slotInfo: any) => {
    // Round to local timezone string format for input type="datetime-local"
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    const localStart = new Date(slotInfo.start.getTime() - tzOffset).toISOString().slice(0, 16);
    let localEnd = new Date(slotInfo.end.getTime() - tzOffset).toISOString().slice(0, 16);
    
    if (localStart === localEnd) {
       // Single click on month view means start and end are 00:00. Set end to end of day.
       const end = new Date(slotInfo.start.getTime());
       end.setHours(23, 59);
       localEnd = new Date(end.getTime() - tzOffset).toISOString().slice(0, 16);
    }

    openForm({
      date: localStart,
      endDate: localEnd
    });
  };

  const handleSelectEvent = (eventData: any) => {
    // Try to find the root event if it's a recurrence
    const rootId = eventData.id.split('-recur')[0];
    const rootEvent = data.events.find(e => e.id === rootId);
    if (rootEvent) {
      const tzOffset = (new Date()).getTimezoneOffset() * 60000;
      openForm({
        ...rootEvent,
        date: new Date(new Date(rootEvent.date).getTime() - tzOffset).toISOString().slice(0, 16),
        endDate: new Date(new Date(rootEvent.endDate).getTime() - tzOffset).toISOString().slice(0, 16)
      });
    }
  };

  // Generate instances for recurring events
  const calendarEvents = useMemo(() => {
    const instances: any[] = [];
    const limitDate = addMonths(new Date(), 6);

    data.events.forEach(ev => {
      let currentStart = new Date(ev.date);
      let currentEnd = new Date(ev.endDate || new Date(new Date(ev.date).getTime() + 3600000));
      
      // Fix instances where end time is logged before start time mathematically
      if (currentEnd <= currentStart) {
        currentEnd = new Date(currentEnd.getTime() + 24 * 60 * 60 * 1000);
      }
      
      const durationMs = currentEnd.getTime() - currentStart.getTime();
      
      instances.push({
        ...ev,
        start: currentStart,
        end: currentEnd
      });

      if (ev.recurrence && ev.recurrence !== 'none') {
        let i = 1;
        while (i < 90) { // Limit instances to prevent infinite loops visually
          if (ev.recurrence === 'daily') {
            currentStart = addDays(new Date(ev.date), i);
          } else if (ev.recurrence === 'weekly') {
            currentStart = addWeeks(new Date(ev.date), i);
          } else if (ev.recurrence === 'monthly') {
            currentStart = addMonths(new Date(ev.date), i);
          }
          currentEnd = new Date(currentStart.getTime() + durationMs);

          if (currentStart > limitDate) break;
          
          instances.push({
            ...ev,
            id: `${ev.id}-recur-${i}`,
            start: currentStart,
            end: currentEnd
          });
          i++;
        }
      }
    });
    return instances;
  }, [data.events]);

  const EventComponent = ({ event }: any) => {
    const taskList = (event.tasks || []) as EventTask[];
    const labeled = taskList.filter((t) => String(t.label || '').trim());
    const openCount = labeled.filter((t) => !t.done).length;
    const lucidN = Array.isArray(event.lucidGoalRefs) ? event.lucidGoalRefs.length : 0;
    return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '2px 4px', fontSize: '0.75rem', overflow: 'hidden' }}>
      <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{event.title}</div>
      {(lucidN > 0 || labeled.length > 0 || event.moneyEarned > 0 || event.moneySpent > 0 || (event.contactIds && event.contactIds.length > 0) || (event.assetIds && event.assetIds.length > 0) || (event.placeIds && event.placeIds.length > 0)) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', fontSize: '0.65rem', marginTop: '2px', alignItems: 'center' }}>
          {lucidN > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, opacity: 0.95 }} title="Lucid goals linked">
              <Sparkles size={10} style={{ color: '#22d3ee' }} />
              {lucidN}
            </span>
          )}
          {labeled.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, opacity: 0.95 }} title="Tasks done / total">
              <ListChecks size={10} />
              {labeled.length - openCount}/{labeled.length}
            </span>
          )}
          {event.moneyEarned > 0 && <span style={{ color: '#34d399', fontWeight: 600 }}>+${event.moneyEarned}</span>}
          {event.moneySpent > 0 && <span style={{ color: '#f87171', fontWeight: 600 }}>-${event.moneySpent}</span>}
          {event.contactIds && event.contactIds.length > 0 && <UserPlus size={10} style={{ opacity: 0.7 }} />}
          {event.assetIds && event.assetIds.length > 0 && <Briefcase size={10} style={{ opacity: 0.7 }} />}
          {event.placeIds && event.placeIds.length > 0 && <MapPin size={10} style={{ opacity: 0.85 }} />}
        </div>
      )}
    </div>
  );
  };

  return (
    <>
      {/* Refining Custom CSS for better integration with the dark aesthetic */}
      <style>{`
        .rbc-calendar {
          font-family: var(--font-body);
          color: var(--text-main);
          background: rgba(255, 255, 255, 0.015);
          border-radius: var(--radius-lg);
          padding: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.05); /* Softer outer border */
        }
        .rbc-btn-group button {
          color: var(--text-muted);
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: transparent;
        }
        .rbc-btn-group button:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-main);
        }
        .rbc-btn-group button.rbc-active {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
          box-shadow: none;
        }
        .rbc-toolbar button {
          font-family: var(--font-body);
        }
        .rbc-header {
          padding: 0.5rem;
          font-weight: 600;
          color: var(--text-muted);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05) !important;
        }
        .rbc-month-view, .rbc-time-view, .rbc-agenda-view {
          border-color: rgba(255, 255, 255, 0.05);
        }
        .rbc-day-bg + .rbc-day-bg, .rbc-month-row + .rbc-month-row, .rbc-time-header-content {
          border-color: rgba(255, 255, 255, 0.05) !important;
        }
        .rbc-time-content, .rbc-time-slot {
          border-color: rgba(255, 255, 255, 0.03) !important; /* Very subtle horizontal grid lines */
        }
        .rbc-off-range-bg {
          background: rgba(0,0,0,0.15);
        }
        .rbc-today {
          background: rgba(99, 102, 241, 0.05);
        }
        .rbc-event {
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          border-radius: 6px;
          padding: 0px !important;
          transition: transform 0.2s, filter 0.2s;
        }
        .rbc-event:hover {
          filter: brightness(1.2);
          transform: translateY(-1px);
        }
        .rbc-event-content {
          padding: 0;
          height: 100%;
        }
        .rbc-time-gutter {
          color: var(--text-muted);
          font-size: 0.75rem;
        }
        .rbc-current-time-indicator {
          background-color: var(--warning);
        }
      `}</style>
      
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div className="page-header" style={{ marginBottom: '1rem' }}>
          <h1 className="page-title">Value Schedule</h1>
          <button className="btn-primary" onClick={() => openForm()}>
            <Plus size={20} /> Add Event
          </button>
        </div>

        <div style={{ flex: 1, minHeight: '600px' }}>
          <Calendar
            localizer={localizer}
            events={calendarEvents}
            startAccessor="start"
            endAccessor="end"
            defaultView={Views.WEEK}
            views={['month', 'week', 'day', 'agenda']}
            showMultiDayTimes={true}
            components={{
              event: EventComponent
            }}
            selectable={true}
            onSelectSlot={handleSelectSlot}
            onSelectEvent={handleSelectEvent}
            eventPropGetter={(event: any) => ({
              style: {
                backgroundColor: event.color ? `${event.color}e6` : 'rgba(99, 102, 241, 0.9)',
                borderColor: event.color ? `${event.color}90` : 'rgba(255, 255, 255, 0.1)',
              }
            })}
          />
        </div>

        <AnimatePresence>
        {showModal && (
          <div className="modal-overlay">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="modal-content">
              <div className="modal-header">
                <h2>{editingId ? 'Edit Event' : 'New Schedule Event'}</h2>
                <button onClick={() => setShowModal(false)}>&times;</button>
              </div>
              
              <div className="form-group">
                <label>Event Title</label>
                <input type="text" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} placeholder="Goal block, deep work, workout…" autoFocus />
              </div>

              {lucidEnabled && (
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Sparkles size={16} style={{ color: '#22d3ee' }} />
                    Lucid goals (link this time block)
                  </label>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0.5rem' }}>
                    Pulled from <code style={{ fontSize: '0.75rem' }}>goal_app_state.goals</code>. The scheduler stores only indices; labels always match Lucid. Select one or more directives or key results.
                  </p>
                  {lucidPickOptions.length === 0 && !lucidLoading && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      No goals in Lucid yet — add directives in Lucid first.
                    </span>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    {lucidPickOptions.map((opt) => {
                      const selected = (newEvent.lucidGoalRefs || []).some(
                        (r) => lucidGoalRefKey(r) === lucidGoalRefKey(opt.ref),
                      );
                      return (
                        <button
                          key={lucidGoalRefKey(opt.ref)}
                          type="button"
                          onClick={() => toggleLucidGoalRef(opt.ref as LucidGoalRef)}
                          style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '9999px',
                            border: `1px solid ${selected ? 'rgba(34, 211, 238, 0.65)' : 'var(--glass-border)'}`,
                            background: selected ? 'rgba(34, 211, 238, 0.14)' : 'transparent',
                            color: selected ? '#e0f2fe' : 'var(--text-muted)',
                            fontSize: '0.8rem',
                            maxWidth: '100%',
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <ListChecks size={16} /> Goals &amp; tasks (optional)
                </label>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0.5rem' }}>
                  Tie checklist items to <strong>Assets</strong> so this calendar slot shows what to do and what to complete. Checking a box saves immediately when editing an existing event.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {(newEvent.tasks || []).map((task) => (
                    <div
                      key={task.id}
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 0.65rem',
                        borderRadius: '8px',
                        border: '1px solid var(--glass-border)',
                        background: 'rgba(0,0,0,0.15)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={task.done}
                        onChange={() => toggleTaskDone(task.id)}
                        title="Mark done"
                      />
                      <input
                        type="text"
                        value={task.label}
                        onChange={(e) => patchTask(task.id, { label: e.target.value })}
                        placeholder="Task description"
                        style={{ flex: '1 1 140px', minWidth: '120px' }}
                      />
                      <select
                        value={task.assetId || ''}
                        onChange={(e) =>
                          patchTask(task.id, { assetId: e.target.value || undefined })
                        }
                        style={{
                          flex: '0 1 160px',
                          minWidth: '100px',
                          borderRadius: '6px',
                          padding: '0.35rem 0.5rem',
                          border: '1px solid var(--glass-border)',
                          background: 'var(--bg-base)',
                          color: 'inherit',
                        }}
                      >
                        <option value="">Asset (optional)</option>
                        {data.assets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => removeTask(task.id)}
                        style={{ padding: '0.35rem 0.5rem' }}
                        title="Remove task"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn-secondary" onClick={addTaskRow} style={{ alignSelf: 'flex-start' }}>
                    <Plus size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    Add task
                  </button>
                </div>
              </div>

              {lucidEnabled && (
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Sparkles size={16} style={{ color: '#22d3ee' }} />
                    Lucid tasks (this day)
                  </label>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0.5rem' }}>
                    Same database as{' '}
                    <a
                      href="https://github.com/clipsog/Goalachiever"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: 'var(--primary)' }}
                    >
                      Goalachiever / Lucid
                    </a>
                    . Tasks are filtered to the <strong>local calendar day</strong> of the event start (
                    {newEvent.date ? lucidDayKey(new Date(newEvent.date as string)) : '—'}). Completing here updates
                    Lucid immediately.
                  </p>
                  {lucidLoading && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Loading Lucid…</p>
                  )}
                  {lucidError && (
                    <p style={{ fontSize: '0.85rem', color: '#f87171', marginBottom: '0.5rem' }}>{lucidError}</p>
                  )}
                  {!lucidLoading && lucidDayTasks.length === 0 && !lucidError && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      No Lucid tasks scheduled for this day.
                    </p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {lucidDayTasks.map((t) => {
                      const tid = t.tid ? String(t.tid) : '';
                      const busy = lucidTogglingTid === tid;
                      return (
                        <div
                          key={tid || `${t.text}-${t.goalIndex}-${t.subIndex}`}
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem 0.65rem',
                            borderRadius: '8px',
                            border: '1px solid rgba(34, 211, 238, 0.25)',
                            background: 'rgba(34, 211, 238, 0.06)',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={t.done}
                            disabled={!tid || busy}
                            onChange={() => void handleLucidToggle(t)}
                            title={tid ? 'Syncs to Lucid' : 'Missing tid'}
                          />
                          <span style={{ flex: '1 1 200px', fontSize: '0.9rem' }}>{t.text}</span>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              color: 'var(--text-muted)',
                              maxWidth: '100%',
                            }}
                          >
                            {goalLabelForTask(lucidGoals, t)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Start Time</label>
                  <input type="datetime-local" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>End Time</label>
                  <input type="datetime-local" value={newEvent.endDate} onChange={e => setNewEvent({...newEvent, endDate: e.target.value})} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Recurrence</label>
                  <select value={newEvent.recurrence || 'none'} onChange={e => setNewEvent({...newEvent, recurrence: e.target.value as any})}>
                    <option value="none" style={{ background: 'var(--bg-base)' }}>Does not repeat</option>
                    <option value="daily" style={{ background: 'var(--bg-base)' }}>Daily</option>
                    <option value="weekly" style={{ background: 'var(--bg-base)' }}>Weekly</option>
                    <option value="monthly" style={{ background: 'var(--bg-base)' }}>Monthly</option>
                  </select>
                </div>
                
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Color Tag</label>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                    {['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899'].map(c => (
                      <div
                        key={c}
                        onClick={() => setNewEvent({...newEvent, color: c})}
                        style={{
                          width: '24px', height: '24px', borderRadius: '50%', background: c,
                          border: newEvent.color === c ? '2px solid white' : '2px solid transparent',
                          cursor: 'pointer', transition: 'all 0.2s',
                          boxShadow: newEvent.color === c ? '0 0 10px rgba(255,255,255,0.4)' : 'none'
                        }}
                      />
                    ))}
                    
                    {/* Native Custom Color Grid Picker */}
                    <div style={{ position: 'relative', width: '24px', height: '24px', borderRadius: '50%', overflow: 'hidden', border: (!['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', undefined].includes(newEvent.color)) ? '2px solid white' : '1px solid rgba(255,255,255,0.2)' }}>
                      <input 
                        type="color" 
                        value={newEvent.color || '#ffffff'} 
                        onChange={e => setNewEvent({...newEvent, color: e.target.value})}
                        style={{ position: 'absolute', top: '-10px', left: '-10px', width: '50px', height: '50px', cursor: 'pointer', border: 'none', padding: 0 }}
                        title="Choose custom color grid"
                      />
                    </div>

                    <div 
                      onClick={() => setNewEvent({...newEvent, color: undefined})}
                      style={{
                        width: '24px', height: '24px', borderRadius: '50%', background: 'transparent',
                        border: !newEvent.color ? '2px solid white' : '1px dashed var(--glass-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                      }}
                    >
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>/</span>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Money Earned ($)</label>
                  <input type="number" value={newEvent.moneyEarned} onChange={e => setNewEvent({...newEvent, moneyEarned: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Money Spent ($)</label>
                  <input type="number" value={newEvent.moneySpent} onChange={e => setNewEvent({...newEvent, moneySpent: parseFloat(e.target.value) || 0})} />
                </div>
              </div>

              <div className="form-group">
                <label>Assets Used</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {data.assets.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No assets added globally yet.</span>}
                  {data.assets.map(a => (
                    <button 
                      key={a.id}
                      onClick={() => toggleAsset(a.id)}
                      style={{ 
                        padding: '0.5rem 1rem', 
                        borderRadius: '9999px',
                        border: `1px solid ${newEvent.assetIds?.includes(a.id) ? 'var(--primary)' : 'var(--glass-border)'}`,
                        background: newEvent.assetIds?.includes(a.id) ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                        color: newEvent.assetIds?.includes(a.id) ? 'white' : 'var(--text-muted)'
                      }}
                    >
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Places</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {data.places.length === 0 && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      Add places under Assets → Places to tag locations (gym, store, office).
                    </span>
                  )}
                  {data.places.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePlace(p.id)}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '9999px',
                        border: `1px solid ${newEvent.placeIds?.includes(p.id) ? 'var(--primary)' : 'var(--glass-border)'}`,
                        background: newEvent.placeIds?.includes(p.id) ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                        color: newEvent.placeIds?.includes(p.id) ? 'white' : 'var(--text-muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      <MapPin size={14} />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Network Involved</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  {data.contacts.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No contacts added globally yet.</span>}
                  {data.contacts.map(c => (
                    <button 
                      key={c.id}
                      onClick={() => toggleContact(c.id)}
                      style={{ 
                        padding: '0.5rem 1rem', 
                        borderRadius: '9999px',
                        border: `1px solid ${newEvent.contactIds?.includes(c.id) ? 'var(--primary)' : 'var(--glass-border)'}`,
                        background: newEvent.contactIds?.includes(c.id) ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                        color: newEvent.contactIds?.includes(c.id) ? 'white' : 'var(--text-muted)'
                      }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
                <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn-primary" onClick={handleSave}>{editingId ? 'Update Event' : 'Save Event'}</button>
              </div>
            </motion.div>
          </div>
        )}
        </AnimatePresence>
      </div>
    </>
  );
};

export default ScheduleView;
