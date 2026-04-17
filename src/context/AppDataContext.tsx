import React, { createContext, useContext, useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ??
  'https://coverhakfcoehzcqnadu.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvdmVyaGFrZmNvZWh6Y3FuYWR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNTE1MzcsImV4cCI6MjA5MDYyNzUzN30.Uy_E-MQi3nJ4jteh6LHx6n8nt04srAdW-ouMjy-ErOU';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const CLOUD_ROW_ID = "asset-scheduler-main";
const CLOUD_TABLE = "asset_scheduler_state";

function isMissingCloudTableError(err: unknown): boolean {
  const e = err as { message?: string; code?: string; details?: string };
  const msg = String(e.message ?? e.details ?? err ?? '');
  return (
    e.code === 'PGRST205' ||
    msg.includes('relation') ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('Could not find the table')
  );
}

async function warnLocalApiGetStateFailed(res: Response) {
  if (import.meta.env.PROD) return;
  let detail = '';
  let hint = '';
  try {
    const j = (await res.json()) as { detail?: string; hint?: string };
    if (j?.detail) detail = ` ${j.detail}`;
    if (j?.hint) hint = ` ${j.hint}`;
  } catch {
    /* Vite proxy may return HTML when the API process is down */
  }
  console.warn(
    `[Assets] GET /api/state returned ${res.status}.${detail}${hint} Start Postgres (port 54331) and \`npm run api\` (8788). Supabase noise: set VITE_DISABLE_CLOUD_SYNC=true for local-only.`,
  );
}

export type EventTask = {
  id: string;
  label: string;
  done: boolean;
  /** Optional: which asset this step supports (pick from your Assets list) */
  assetId?: string;
  /**
   * When set, checking this row done/undone also toggles that task in Lucid (`goal_app_state.tasks` by `tid`).
   */
  lucidTid?: string;
};

/** Pointer into Lucid `goal_app_state.goals` (same indices as the Lucid app). */
export type LucidGoalRef = {
  goalIndex: number;
  /** `null` = whole goal; number = subgoal (key result) index */
  subIndex: number | null;
};

export type Event = {
  id: string;
  title: string;
  date: string;
  endDate: string;
  moneySpent: number;
  moneyEarned: number;
  contactIds: string[];
  assetIds?: string[];
  /** Tagged locations (gym, groceries, etc.) for schedule + revenue rollups */
  placeIds?: string[];
  isRecurring?: boolean;
  recurrence?: 'daily' | 'weekly' | 'monthly' | 'none';
  color?: string;
  /** Checklist for this calendar slot (goals / steps); can link rows to assets */
  tasks?: EventTask[];
  /** Lucid directives linked to this calendar block (live titles from `goal_app_state`) */
  lucidGoalRefs?: LucidGoalRef[];
};

export type Subscription = {
  id: string;
  name: string;
  cost: number;
  usageCount: number;
  status: 'active' | 'evaluating' | 'cancelled';
};

export type Asset = {
  id: string;
  name: string;
  category: string;
  condition: 'excellent' | 'good' | 'maintenance-needed' | 'sell';
  usageCount: number;
};

export type ClothingStyle =
  | 'formal'
  | 'casual'
  | 'sportswear'
  | 'sandals'
  | 'sneakers'
  | 'underwear'
  | 'socks'
  | 'other';

export type ClothingItem = {
  id: string;
  /** Human label, e.g. “Navy blazer” */
  name: string;
  /** Owned vs wishlist */
  kind: 'owned' | 'wishlist';
  /** High‑level style bucket */
  style: ClothingStyle;
  /** e.g. Uniqlo, Nike */
  brand: string;
  /** Free-form color tags, e.g. “navy”, “white/black” */
  color: string;
  /** Free-form size, e.g. “M”, “30x30”, “US 9” */
  size: string;
  /** Optional image URL for quick visual recognition */
  imageUrl?: string;
  /** For wishlist items: product link */
  link?: string;
};

export type ContactRelationship =
  | 'family'
  | 'friend'
  | 'acquaintance'
  | 'client'
  | 'employee'
  | 'partner'
  | 'other';

export type ContactPlaceLink = {
  placeId: string;
  typicalTimes?: string;
  notes?: string;
};

export type InteractionLog = {
  id: string;
  /** ISO timestamp */
  at: string;
  /** Short label shown in list */
  title: string;
  /** Optional longer notes */
  notes?: string;
};

export type Contact = {
  id: string;
  name: string;
  status: 'useful' | 'neutral' | 'not-useful';
  relationshipType?: ContactRelationship;
  /** Specific role/title, e.g. hairdresser, cousin, manager at X */
  roleLabel?: string;
  notes?: string;
  canDoForYou: string;
  canDoForThem: string;
  timeSpentHours: number;
  amountInvested: number;
  returnReceived: number;
  goalsWorkedTowards: string;
  /** Legacy place ids, still read for backwards compatibility */
  placeIds?: string[];
  /** Rich place links with metadata (e.g. times they are there) */
  placeLinks?: ContactPlaceLink[];
  /** Private history notes, shown when opening the card */
  interactionLogs?: InteractionLog[];
};

export type Place = {
  id: string;
  name: string;
  category: string;
  address?: string;
  notes?: string;
  /** Private history notes, shown when opening the card */
  interactionLogs?: InteractionLog[];
};

type AppData = {
  events: Event[];
  subscriptions: Subscription[];
  assets: Asset[];
  contacts: Contact[];
  places: Place[];
  clothing: ClothingItem[];
};

type AppDataContextType = {
  data: AppData;
  isSyncing: boolean;
  addEvent: (event: Omit<Event, 'id'>) => void;
  updateEvent: (id: string, event: Partial<Event>) => void;
  addSubscription: (sub: Omit<Subscription, 'id'>) => void;
  updateSubscription: (id: string, sub: Partial<Subscription>) => void;
  addAsset: (asset: Omit<Asset, 'id'>) => void;
  updateAsset: (id: string, asset: Partial<Asset>) => void;
  addClothingItem: (kind: ClothingItem['kind'], item: Omit<ClothingItem, 'id' | 'kind'>) => void;
  updateClothingItem: (id: string, patch: Partial<ClothingItem>) => void;
  deleteClothingItem: (id: string) => void;
  addContact: (contact: Omit<Contact, 'id'>) => void;
  updateContact: (id: string, contact: Partial<Contact>) => void;
  addPlace: (place: Omit<Place, 'id'>) => void;
  updatePlace: (id: string, place: Partial<Place>) => void;
  deletePlace: (id: string) => void;
  triggerManualSync: () => void;
};

const emptyData: AppData = {
  events: [],
  subscriptions: [],
  assets: [],
  contacts: [],
  places: [],
  clothing: [],
};

function normalizeAppData(raw: Partial<AppData> | null | undefined): AppData {
  const e = raw ?? {};
  const events = Array.isArray(e.events) ? e.events : [];
  const contacts = Array.isArray(e.contacts) ? e.contacts : [];
  const places = Array.isArray(e.places) ? e.places : [];
  const clothing = Array.isArray((e as any).clothing) ? ((e as any).clothing as ClothingItem[]) : [];
  return {
    events: events.map((ev) => {
      const rawTasks = Array.isArray((ev as Event).tasks) ? (ev as Event).tasks! : [];
      const tasks: EventTask[] = rawTasks
        .filter((t) => t && typeof (t as EventTask).label === 'string' && String((t as EventTask).label).trim())
        .map((t) => {
          const x = t as EventTask;
          return {
            id: typeof x.id === 'string' && x.id ? x.id : crypto.randomUUID(),
            label: String(x.label).trim(),
            done: Boolean(x.done),
            assetId: typeof x.assetId === 'string' && x.assetId ? x.assetId : undefined,
          };
        });
      const rawRefs = Array.isArray((ev as Event).lucidGoalRefs) ? (ev as Event).lucidGoalRefs! : [];
      const lucidGoalRefs: LucidGoalRef[] = rawRefs
        .filter((r) => r && typeof (r as LucidGoalRef).goalIndex === 'number' && !Number.isNaN((r as LucidGoalRef).goalIndex))
        .map((r) => {
          const x = r as LucidGoalRef;
          let subIndex: number | null = null;
          if (x.subIndex !== null && x.subIndex !== undefined && !Number.isNaN(Number(x.subIndex))) {
            subIndex = Math.max(0, Math.floor(Number(x.subIndex)));
          }
          return {
            goalIndex: Math.max(0, Math.floor(Number(x.goalIndex))),
            subIndex,
          };
        });
      return {
        ...ev,
        placeIds: Array.isArray(ev.placeIds) ? ev.placeIds : [],
        tasks,
        lucidGoalRefs,
      };
    }) as Event[],
    subscriptions: Array.isArray(e.subscriptions) ? e.subscriptions : [],
    assets: Array.isArray(e.assets) ? e.assets : [],
    contacts: contacts.map((c) => {
      const placeLinks = Array.isArray(c.placeLinks)
        ? c.placeLinks.filter((pl): pl is ContactPlaceLink => !!pl?.placeId)
        : [];
      const legacyIds = Array.isArray(c.placeIds) ? c.placeIds : [];
      const mergedIds = Array.from(new Set([...legacyIds, ...placeLinks.map((pl) => pl.placeId)]));
      const interactionLogs = Array.isArray((c as Contact).interactionLogs) ? (c as Contact).interactionLogs : [];
      return {
        ...c,
        relationshipType: c.relationshipType ?? 'acquaintance',
        roleLabel: c.roleLabel ?? '',
        notes: c.notes ?? '',
        placeLinks: mergedIds.map((placeId) => {
          const existing = placeLinks.find((pl) => pl.placeId === placeId);
          return existing ?? { placeId };
        }),
        placeIds: mergedIds,
        interactionLogs,
      };
    }) as Contact[],
    places: places.map((p) => ({
      ...p,
      address: p.address ?? '',
      notes: p.notes ?? '',
      interactionLogs: Array.isArray((p as Place).interactionLogs) ? (p as Place).interactionLogs : [],
    })) as Place[],
    clothing: clothing.map((c) => ({
      id: c.id ?? uuidv4(),
      name: c.name ?? '',
      kind: c.kind === 'wishlist' ? 'wishlist' : 'owned',
      style: (c.style as ClothingStyle) ?? 'other',
      brand: c.brand ?? '',
      color: c.color ?? '',
      size: c.size ?? '',
      imageUrl: c.imageUrl ?? undefined,
      link: c.link ?? undefined,
    })) as ClothingItem[],
  };
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

function parseAppDataPayload(raw: unknown): AppData | null {
  if (!raw || typeof raw !== 'object') return null;
  return normalizeAppData(raw as Partial<AppData>);
}

/** True when the saved row has no user-entered records (fresh Postgres seed, etc.). */
function isAppDataEmpty(d: AppData): boolean {
  return (
    d.events.length === 0 &&
    d.subscriptions.length === 0 &&
    d.assets.length === 0 &&
    d.contacts.length === 0 &&
    d.places.length === 0 &&
    d.clothing.length === 0
  );
}

export const AppDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<AppData>(() => {
    try {
      const saved = localStorage.getItem('assetSchedulerData_v1');
      if (!saved) return emptyData;
      return normalizeAppData(JSON.parse(saved) as Partial<AppData>);
    } catch {
      return emptyData;
    }
  });
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [remoteHydrated, setRemoteHydrated] = useState(false);
  const preferLocalDbRef = React.useRef(false);

  // Load: local Postgres API (dev) first, then Supabase
  useEffect(() => {
    const fetchFromSupabase = async () => {
      try {
        setIsSyncing(true);
        const { data: cloudData, error } = await supabase
          .from(CLOUD_TABLE)
          .select('*')
          .eq('id', CLOUD_ROW_ID)
          .maybeSingle();

        if (error) {
          if (isMissingCloudTableError(error)) {
            console.warn(
              'Supabase: table asset_scheduler_state is missing or not exposed. Create it in the Supabase SQL editor or set VITE_DISABLE_CLOUD_SYNC=true for local-only.',
            );
          } else {
            console.error('Supabase fetch error:', error);
          }
          return;
        }

        if (cloudData) {
          setData(
            normalizeAppData({
              events: cloudData.events,
              subscriptions: cloudData.subscriptions,
              assets: cloudData.assets,
              contacts: cloudData.contacts,
              places: cloudData.places,
            } as Partial<AppData>),
          );
        }
      } catch (e) {
        console.error('Cloud fetch failed', e);
      } finally {
        setIsSyncing(false);
      }
    };

    const run = async () => {
      let loadedLocal = false;
      try {
        setIsSyncing(true);
        const res = await fetch('/api/state');
        if (res.ok) {
          const body = await res.json();
          const parsed = parseAppDataPayload(body?.state);
          if (parsed) {
            preferLocalDbRef.current = true;
            // Do not replace non-empty browser data with an empty Postgres row (first-time API).
            setData((prev) => {
              if (isAppDataEmpty(parsed) && !isAppDataEmpty(prev)) {
                return prev;
              }
              return parsed;
            });
            loadedLocal = true;
          }
        } else {
          await warnLocalApiGetStateFailed(res);
        }
      } catch {
        /* no local API */
      } finally {
        setIsSyncing(false);
      }

      if (loadedLocal) return;

      if (import.meta.env.VITE_DISABLE_CLOUD_SYNC === 'true') {
        return;
      }
      await fetchFromSupabase();
    };

    void run().finally(() => setRemoteHydrated(true));
  }, []);

  // Save: localStorage + debounced Postgres API and/or Supabase
  useEffect(() => {
    localStorage.setItem('assetSchedulerData_v1', JSON.stringify(data));

    if (!remoteHydrated) return;

    const pushRemote = async () => {
      try {
        setIsSyncing(true);
        if (preferLocalDbRef.current) {
          const r = await fetch('/api/state', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: data }),
          });
          if (!r.ok) {
            const text = await r.text();
            if (import.meta.env.DEV) {
              try {
                const j = JSON.parse(text) as { detail?: string; hint?: string };
                console.warn('[Assets] PUT /api/state failed:', j?.detail ?? text, j?.hint ?? '');
              } catch {
                console.warn('[Assets] PUT /api/state failed:', r.status, text.slice(0, 200));
              }
            } else {
              console.error('Local API save failed', text);
            }
          }
          return;
        }

        if (import.meta.env.VITE_DISABLE_CLOUD_SYNC === 'true') return;

        const { error: upErr } = await supabase.from(CLOUD_TABLE).upsert(
          {
            id: CLOUD_ROW_ID,
            events: data.events,
            subscriptions: data.subscriptions,
            assets: data.assets,
            contacts: data.contacts,
            places: data.places,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' },
        );
        if (upErr) {
          if (isMissingCloudTableError(upErr)) {
            console.warn('Supabase upsert skipped: asset_scheduler_state table missing.');
          } else {
            console.error('Supabase upsert error:', upErr);
          }
        }
      } catch (e) {
        console.error('Remote save failed', e);
      } finally {
        setIsSyncing(false);
      }
    };

    const timeout = setTimeout(() => {
      void pushRemote();
    }, 1000);

    return () => clearTimeout(timeout);
  }, [data, remoteHydrated]);

  const addEvent = (event: Omit<Event, 'id'>) => setData(prev => ({ ...prev, events: [...prev.events, { ...event, id: uuidv4() }] }));
  const updateEvent = (id: string, event: Partial<Event>) => setData(prev => ({ ...prev, events: prev.events.map(e => e.id === id ? { ...e, ...event } : e) }));
  
  const addSubscription = (sub: Omit<Subscription, 'id'>) => setData(prev => ({ ...prev, subscriptions: [...prev.subscriptions, { ...sub, id: uuidv4() }] }));
  const updateSubscription = (id: string, sub: Partial<Subscription>) => setData(prev => ({ ...prev, subscriptions: prev.subscriptions.map(s => s.id === id ? { ...s, ...sub } : s) }));
  
  const addAsset = (asset: Omit<Asset, 'id'>) => setData(prev => ({ ...prev, assets: [...prev.assets, { ...asset, id: uuidv4() }] }));
  const updateAsset = (id: string, asset: Partial<Asset>) => setData(prev => ({ ...prev, assets: prev.assets.map(a => a.id === id ? { ...a, ...asset } : a) }));
  const addClothingItem = (kind: ClothingItem['kind'], item: Omit<ClothingItem, 'id' | 'kind'>) =>
    setData((prev) => ({
      ...prev,
      clothing: [
        ...prev.clothing,
        {
          ...item,
          id: uuidv4(),
          kind,
          style: (item.style as ClothingStyle) ?? 'other',
          brand: item.brand ?? '',
          color: item.color ?? '',
          size: item.size ?? '',
        },
      ],
    }));
  const updateClothingItem = (id: string, patch: Partial<ClothingItem>) =>
    setData((prev) => ({
      ...prev,
      clothing: prev.clothing.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  const deleteClothingItem = (id: string) =>
    setData((prev) => ({
      ...prev,
      clothing: prev.clothing.filter((c) => c.id !== id),
    }));
  
  const addContact = (contact: Omit<Contact, 'id'>) =>
    setData((prev) => {
      const normalized = normalizeAppData({
        ...prev,
        contacts: [...prev.contacts, { ...contact, id: uuidv4() }],
      }).contacts;
      return { ...prev, contacts: normalized };
    });
  const updateContact = (id: string, contact: Partial<Contact>) =>
    setData((prev) => {
      const normalized = normalizeAppData({
        ...prev,
        contacts: prev.contacts.map((c) => (c.id === id ? { ...c, ...contact } : c)),
      }).contacts;
      return { ...prev, contacts: normalized };
    });

  const addPlace = (place: Omit<Place, 'id'>) =>
    setData((prev) => ({ ...prev, places: [...prev.places, { ...place, id: uuidv4() }] }));
  const updatePlace = (id: string, place: Partial<Place>) =>
    setData((prev) => ({
      ...prev,
      places: prev.places.map((p) => (p.id === id ? { ...p, ...place } : p)),
    }));
  const deletePlace = (id: string) =>
    setData((prev) => ({
      ...prev,
      places: prev.places.filter((p) => p.id !== id),
      contacts: prev.contacts.map((c) => ({
        ...c,
        placeIds: (c.placeIds ?? []).filter((pid) => pid !== id),
        placeLinks: (c.placeLinks ?? []).filter((pl) => pl.placeId !== id),
      })),
      events: prev.events.map((e) => ({
        ...e,
        placeIds: (e.placeIds ?? []).filter((pid) => pid !== id),
      })),
    }));

  const triggerManualSync = () => {
    setData(d => ({...d})); // trigger useEffect
  };

  return (
    <AppDataContext.Provider
      value={{
        data,
        isSyncing,
        addEvent,
        updateEvent,
        addSubscription,
        updateSubscription,
        addAsset,
        updateAsset,
        addClothingItem,
        updateClothingItem,
        deleteClothingItem,
        addContact,
        updateContact,
        addPlace,
        updatePlace,
        deletePlace,
        triggerManualSync,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
};

export const useAppData = () => {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData must be used within AppDataProvider');
  return context;
};
