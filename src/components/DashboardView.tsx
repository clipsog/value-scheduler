import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppData } from '../context/AppDataContext';
import { TrendingUp, TrendingDown, Users, Calendar, DollarSign, Activity, MapPin } from 'lucide-react';

const DashboardView = () => {
  const { data } = useAppData();
  const [sharedFinance, setSharedFinance] = useState<null | {
    available: boolean;
    subscriptionsSummary?: { total: number; activeCostMonthly: number };
    accounts?: { total: number; totalBalance: number };
    businessIncome?: { month: number; allTime: number };
  }>(null);

  const totalSpent = data.events.reduce((sum, e) => sum + e.moneySpent, 0);
  const totalEarned = data.events.reduce((sum, e) => sum + e.moneyEarned, 0);
  const netValue = totalEarned - totalSpent;

  /** Split each event’s net across tagged places so multi-place events don’t double-count totals. */
  const placeRevenue = useMemo(() => {
    const byPlace = new Map<string, number>();
    let unassigned = 0;
    for (const e of data.events) {
      const net = e.moneyEarned - e.moneySpent;
      const pids = e.placeIds ?? [];
      if (pids.length === 0) {
        unassigned += net;
        continue;
      }
      const share = net / pids.length;
      for (const pid of pids) {
        byPlace.set(pid, (byPlace.get(pid) ?? 0) + share);
      }
    }
    return { byPlace, unassigned };
  }, [data.events]);

  const placeRows = useMemo(() => {
    return data.places
      .map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        net: placeRevenue.byPlace.get(p.id) ?? 0,
      }))
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  }, [data.places, placeRevenue]);
  
  const totalSubCost = data.subscriptions.reduce((sum, s) => s.status === 'active' ? sum + s.cost : sum, 0);

  useEffect(() => {
    let cancelled = false;
    const loadShared = async () => {
      try {
        const r = await fetch('/api/shared/finance');
        if (!r.ok) return;
        const payload = await r.json();
        if (!cancelled) setSharedFinance(payload);
      } catch {
        /* fallback to local-only dashboard */
      }
    };
    void loadShared();
    return () => {
      cancelled = true;
    };
  }, []);

  const sharedMode = Boolean(sharedFinance?.available);
  const subCostDisplay = sharedMode
    ? Number(sharedFinance?.subscriptionsSummary?.activeCostMonthly ?? 0)
    : totalSubCost;
  const subsEvaluatingCount = sharedMode
    ? 0
    : data.subscriptions.filter((s) => s.status === 'evaluating').length;

  const StatCard = ({ title, value, icon, trend, positive }: any) => (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel" 
      style={{ padding: '1.5rem' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '0.5rem' }}>{title}</p>
          <h3 style={{ fontSize: '1.5rem', margin: 0 }}>{value}</h3>
        </div>
        <div style={{ padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', color: 'var(--primary)' }}>
          {icon}
        </div>
      </div>
      {trend && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: positive ? 'var(--success)' : 'var(--danger)' }}>
          {positive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          <span>{trend}</span>
        </div>
      )}
    </motion.div>
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Overview</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        <StatCard 
          title="Net ROI (Events)" 
          value={`$${netValue.toFixed(2)}`}
          icon={<DollarSign size={20} />}
          trend={totalEarned > 0 ? "Tracking properly" : "Need more data"}
          positive={netValue >= 0}
        />
        <StatCard 
          title="Active Subscriptions" 
          value={`$${subCostDisplay.toFixed(2)} /mo`}
          icon={<Activity size={20} />}
          trend={
            sharedMode
              ? `${sharedFinance?.subscriptionsSummary?.total ?? 0} shared tools`
              : `${subsEvaluatingCount} evaluating`
          }
          positive={false}
        />
        <StatCard
          title="Accounts (shared)"
          value={sharedMode ? `${sharedFinance?.accounts?.total ?? 0}` : `${data.contacts.length}`}
          icon={<DollarSign size={20} />}
          trend={
            sharedMode
              ? `Total balance $${Number(sharedFinance?.accounts?.totalBalance ?? 0).toFixed(2)}`
              : 'Link shared tables to enable'
          }
          positive={true}
        />
        <StatCard
          title="Business income (month)"
          value={`$${Number(sharedFinance?.businessIncome?.month ?? 0).toFixed(2)}`}
          icon={<TrendingUp size={20} />}
          trend={`All-time $${Number(sharedFinance?.businessIncome?.allTime ?? 0).toFixed(2)}`}
          positive={true}
        />
        <StatCard 
          title="Network Connections" 
          value={data.contacts.length}
          icon={<Users size={20} />}
          trend="Connect & Grow"
          positive={true}
        />
        <StatCard 
          title="Upcoming Events" 
          value={data.events.length}
          icon={<Calendar size={20} />}
        />
        <StatCard
          title="Places tracked"
          value={data.places.length}
          icon={<MapPin size={20} />}
          trend="Tag on schedule for revenue splits"
          positive={true}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '1.5rem', fontSize: '1.125rem' }}>Recent Events</h3>
          {data.events.slice(0, 3).map(event => (
            <div key={event.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', borderBottom: '1px solid var(--glass-border)' }}>
              <div>
                <p style={{ fontWeight: 500 }}>{event.title}</p>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{new Date(event.date).toLocaleDateString()}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color: 'var(--success)', fontWeight: 600 }}>+${event.moneyEarned}</p>
                <p style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>-${event.moneySpent}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginBottom: '0.5rem', fontSize: '1.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <MapPin size={18} /> Net by place (events)
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Event profit is split evenly when multiple places are tagged. Untagged events count as “Unassigned”.
          </p>
          {(placeRows.length === 0 && placeRevenue.unassigned === 0) && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Add places under Assets → Places and tag schedule events.</p>
          )}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {placeRevenue.unassigned !== 0 && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '0.65rem 0',
                  borderBottom: '1px solid var(--glass-border)',
                  fontSize: '0.9rem',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>
                <span style={{ color: placeRevenue.unassigned >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                  ${placeRevenue.unassigned.toFixed(2)}
                </span>
              </div>
            )}
            {placeRows.map((row) => (
              <div
                key={row.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.65rem 0',
                  borderBottom: '1px solid var(--glass-border)',
                  fontSize: '0.9rem',
                }}
              >
                <div>
                  <span style={{ fontWeight: 500 }}>{row.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{row.category}</span>
                </div>
                <span style={{ color: row.net >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
                  ${row.net.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '1.5rem', gridColumn: '1 / -1' }}>
          <h3 style={{ marginBottom: '1.5rem', fontSize: '1.125rem' }}>High-Value Contacts</h3>
          {data.contacts.filter(c => c.status === 'useful').slice(0, 3).map(contact => (
            <div key={contact.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0', borderBottom: '1px solid var(--glass-border)' }}>
              <div>
                <p style={{ fontWeight: 500 }}>{contact.name}</p>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{contact.goalsWorkedTowards}</p>
              </div>
              <span className="badge badge-success">Useful</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
