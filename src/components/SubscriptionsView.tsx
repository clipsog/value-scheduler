import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppData } from '../context/AppDataContext';
import type { Subscription } from '../context/AppDataContext';
import { Plus, Activity, AlertCircle } from 'lucide-react';

const SubscriptionsView = () => {
  const { data, addSubscription, updateSubscription } = useAppData();
  const [sharedSubs, setSharedSubs] = useState<Subscription[] | null>(null);
  const [sharedAvailable, setSharedAvailable] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newSub, setNewSub] = useState<Partial<Subscription>>({
    name: '', cost: 0, usageCount: 0, status: 'active'
  });

  const handleSave = () => {
    if (newSub.name) {
      addSubscription(newSub as Omit<Subscription, 'id'>);
      setShowModal(false);
      setNewSub({ name: '', cost: 0, usageCount: 0, status: 'active' });
    }
  };

  const incrementUsage = (sub: Subscription) => {
    updateSubscription(sub.id, { usageCount: sub.usageCount + 1 });
  };

  useEffect(() => {
    let cancelled = false;
    const loadShared = async () => {
      try {
        const r = await fetch('/api/shared/finance');
        if (!r.ok) return;
        const payload = await r.json();
        if (cancelled) return;
        if (payload?.available && Array.isArray(payload?.subscriptions)) {
          setSharedAvailable(true);
          setSharedSubs(
            payload.subscriptions.map((s: any) => ({
              id: String(s.id),
              name: String(s.name ?? ''),
              cost: Number(s.cost ?? 0),
              currency: s.currency ? String(s.currency) : 'USD',
              usageCount: Number(s.usageCount ?? 0),
              status:
                s.status === 'active' || s.status === 'evaluating' || s.status === 'cancelled'
                  ? s.status
                  : 'active',
            }))
          );
        }
      } catch {
        /* fallback to local state */
      }
    };
    void loadShared();
    return () => {
      cancelled = true;
    };
  }, []);

  const subscriptionRows = useMemo(
    () => (sharedAvailable && sharedSubs ? sharedSubs : data.subscriptions),
    [data.subscriptions, sharedAvailable, sharedSubs]
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Subscriptions & Tools</h1>
        {!sharedAvailable && (
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={20} /> Add Tool
          </button>
        )}
      </div>
      {sharedAvailable && (
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Showing shared subscriptions from the linked common database.
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
        {subscriptionRows.map(sub => (
          <motion.div key={sub.id} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-panel" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.25rem' }}>{sub.name}</h3>
              <span className={`badge ${sub.status === 'active' ? 'badge-primary' : sub.status === 'evaluating' ? 'badge-warning' : 'badge-danger'}`} style={{ 
                ...(sub.status === 'evaluating' && { background: 'rgba(245, 158, 11, 0.1)', color: '#fcd34d', border: '1px solid rgba(245, 158, 11, 0.2)' })
              }}>
                {sub.status}
              </span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem', marginBottom: '1.5rem' }}>
              <span style={{ fontSize: '2rem', fontWeight: 700 }}>
                {sub.currency && sub.currency !== 'USD' ? `${sub.currency} ` : '$'}
                {sub.cost.toFixed(2)}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>/month</span>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 'var(--radius-sm)', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Usage Score</span>
                <span style={{ fontWeight: 600 }}>{sub.usageCount} times</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min((sub.usageCount / 50) * 100, 100)}%`, height: '100%', background: 'var(--primary)' }}></div>
              </div>
              {sub.usageCount < 5 && sub.status === 'active' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning)', marginTop: '0.75rem', fontSize: '0.875rem' }}>
                  <AlertCircle size={16} /> Low usage - consider evaluating
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn-secondary"
                style={{ flex: 1, padding: '0.5rem' }}
                onClick={() => incrementUsage(sub)}
                disabled={sharedAvailable}
              >
                <Activity size={16} /> Log Usage
              </button>
              <select 
                value={sub.status} 
                onChange={(e) => updateSubscription(sub.id, { status: e.target.value as any })}
                disabled={sharedAvailable}
                style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)' }}
              >
                <option value="active" style={{ background: 'var(--bg-base)' }}>Active</option>
                <option value="evaluating" style={{ background: 'var(--bg-base)' }}>Evaluating</option>
                <option value="cancelled" style={{ background: 'var(--bg-base)' }}>Cancelled</option>
              </select>
            </div>
          </motion.div>
        ))}
      </div>

      {showModal && !sharedAvailable && (
        <div className="modal-overlay">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="modal-content">
            <div className="modal-header">
              <h2>Add Tool / Subscription</h2>
              <button onClick={() => setShowModal(false)}>&times;</button>
            </div>
            
            <div className="form-group">
              <label>Tool Name</label>
              <input type="text" value={newSub.name} onChange={e => setNewSub({...newSub, name: e.target.value})} placeholder="e.g. Adobe Creative Cloud" />
            </div>
            
            <div className="form-group">
              <label>Monthly Cost ($)</label>
              <input type="number" value={newSub.cost} onChange={e => setNewSub({...newSub, cost: parseFloat(e.target.value) || 0})} />
            </div>

            <div className="form-group">
              <label>Status</label>
              <select value={newSub.status} onChange={e => setNewSub({...newSub, status: e.target.value as any})}>
                <option value="active">Active</option>
                <option value="evaluating">Evaluating</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave}>Save Tool</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
export default SubscriptionsView;
