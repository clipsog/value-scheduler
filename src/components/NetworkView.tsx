import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppData } from '../context/AppDataContext';
import type { Contact, InteractionLog } from '../context/AppDataContext';
import { Plus, User, Clock, DollarSign, Target, MapPin, Pencil } from 'lucide-react';

const NetworkView = () => {
  const { data, addContact, updateContact } = useAppData();
  const [showModal, setShowModal] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [newLogTitle, setNewLogTitle] = useState('');
  const [newLogNotes, setNewLogNotes] = useState('');
  const [contactForm, setContactForm] = useState<Partial<Contact>>({
    name: '',
    status: 'neutral',
    relationshipType: 'acquaintance',
    roleLabel: '',
    notes: '',
    canDoForYou: '',
    canDoForThem: '',
    timeSpentHours: 0,
    amountInvested: 0,
    returnReceived: 0,
    goalsWorkedTowards: '',
    placeLinks: [],
  });

  const resetForm = () =>
    setContactForm({
      name: '',
      status: 'neutral',
      relationshipType: 'acquaintance',
      roleLabel: '',
      notes: '',
      canDoForYou: '',
      canDoForThem: '',
      timeSpentHours: 0,
      amountInvested: 0,
      returnReceived: 0,
      goalsWorkedTowards: '',
      placeLinks: [],
    });

  const openCreate = () => {
    setEditingContactId(null);
    resetForm();
    setShowModal(true);
  };

  const openEdit = (contact: Contact) => {
    setEditingContactId(contact.id);
    setContactForm({
      ...contact,
      placeLinks: contact.placeLinks ?? [],
      relationshipType: contact.relationshipType ?? 'acquaintance',
    });
    setShowModal(true);
  };

  const selectedContact = useMemo(
    () => data.contacts.find((c) => c.id === selectedContactId) ?? null,
    [data.contacts, selectedContactId],
  );

  const openDetails = (contactId: string) => {
    setSelectedContactId(contactId);
    setNewLogTitle('');
    setNewLogNotes('');
  };

  const closeDetails = () => {
    setSelectedContactId(null);
    setNewLogTitle('');
    setNewLogNotes('');
  };

  const addInteractionLog = () => {
    if (!selectedContact) return;
    const title = newLogTitle.trim();
    const notes = newLogNotes.trim();
    if (!title && !notes) return;
    const next: InteractionLog = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      title: title || 'Interaction',
      notes: notes || undefined,
    };
    const logs = Array.isArray(selectedContact.interactionLogs) ? selectedContact.interactionLogs : [];
    updateContact(selectedContact.id, { interactionLogs: [next, ...logs] });
    setNewLogTitle('');
    setNewLogNotes('');
  };

  const deleteInteractionLog = (logId: string) => {
    if (!selectedContact) return;
    const logs = Array.isArray(selectedContact.interactionLogs) ? selectedContact.interactionLogs : [];
    updateContact(selectedContact.id, { interactionLogs: logs.filter((l) => l.id !== logId) });
  };

  const handleSave = () => {
    if (!contactForm.name?.trim()) return;
    const placeLinks = (contactForm.placeLinks ?? []).filter((pl) => !!pl.placeId);
    const payload: Partial<Contact> = {
      ...contactForm,
      name: contactForm.name.trim(),
      relationshipType: contactForm.relationshipType ?? 'acquaintance',
      roleLabel: contactForm.roleLabel?.trim() ?? '',
      notes: contactForm.notes?.trim() ?? '',
      placeLinks,
      placeIds: placeLinks.map((pl) => pl.placeId),
    };
    if (editingContactId) {
      updateContact(editingContactId, payload);
    } else {
      addContact(payload as Omit<Contact, 'id'>);
    }
    setShowModal(false);
    setEditingContactId(null);
    resetForm();
  };

  const togglePlaceForForm = (placeId: string) => {
    const cur = contactForm.placeLinks ?? [];
    const has = cur.some((pl) => pl.placeId === placeId);
    const placeLinks = has ? cur.filter((pl) => pl.placeId !== placeId) : [...cur, { placeId }];
    setContactForm({ ...contactForm, placeLinks });
  };

  const togglePlaceForContact = (contactId: string, placeId: string) => {
    const c = data.contacts.find((x) => x.id === contactId);
    if (!c) return;
    const cur = c.placeLinks ?? [];
    const has = cur.some((pl) => pl.placeId === placeId);
    const placeLinks = has ? cur.filter((pl) => pl.placeId !== placeId) : [...cur, { placeId }];
    updateContact(contactId, {
      placeLinks,
      placeIds: placeLinks.map((pl) => pl.placeId),
    });
  };

  const prettyRelationship = (value?: string) => {
    if (!value) return 'Acquaintance';
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Network Intelligence</h1>
        <button className="btn-primary" onClick={openCreate}>
          <Plus size={20} /> Add Contact
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
        {data.contacts.map(contact => (
          <motion.div
            key={contact.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel"
            style={{ padding: '0', overflow: 'hidden', cursor: 'pointer' }}
            onClick={() => openDetails(contact.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') openDetails(contact.id);
            }}
          >
            <div style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                    <User size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.25rem', margin: 0 }}>{contact.name}</h3>
                    <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.8rem' }}>
                      {prettyRelationship(contact.relationshipType)}
                    </p>
                    {contact.roleLabel && (
                      <p style={{ color: 'var(--text-muted)', marginTop: '0.15rem', fontSize: '0.8rem' }}>
                        {contact.roleLabel}
                      </p>
                    )}
                    {contact.notes && (
                      <p style={{ color: 'var(--text-muted)', marginTop: '0.15rem', fontSize: '0.8rem' }}>
                        {contact.notes}
                      </p>
                    )}
                    <select 
                      value={contact.status} 
                      onChange={(e) => updateContact(contact.id, { status: e.target.value as any })}
                      style={{ background: 'transparent', border: 'none', padding: 0, marginTop: '0.25rem', fontSize: '0.875rem', 
                        color: contact.status === 'useful' ? 'var(--success)' : contact.status === 'not-useful' ? 'var(--danger)' : 'var(--text-muted)' 
                      }}
                    >
                      <option value="useful" style={{ background: 'var(--bg-base)', color: 'var(--success)' }}>Useful Asset</option>
                      <option value="neutral" style={{ background: 'var(--bg-base)', color: 'white' }}>Neutral</option>
                      <option value="not-useful" style={{ background: 'var(--bg-base)', color: 'var(--danger)' }}>Liability</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit(contact);
                  }}
                >
                  <Pencil size={14} /> Edit
                </button>
              </div>
            </div>

            <div style={{ padding: '1.5rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>What they offer</p>
                  <p style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>{contact.canDoForYou || '—'}</p>
                </div>
                <div>
                  <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>What you provide</p>
                  <p style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>{contact.canDoForThem || '—'}</p>
                </div>
              </div>

              {data.places.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <p
                    style={{
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <MapPin size={14} /> Places
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    {data.places.map((p) => {
                      const on = (contact.placeLinks ?? []).some((pl) => pl.placeId === p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePlaceForContact(contact.id, p.id);
                          }}
                          style={{
                            padding: '0.35rem 0.75rem',
                            borderRadius: '9999px',
                            fontSize: '0.8rem',
                            border: `1px solid ${on ? 'var(--primary)' : 'var(--glass-border)'}`,
                            background: on ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                            color: on ? 'white' : 'var(--text-muted)',
                          }}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  <Target size={16} /> Goals: <span style={{ color: 'white' }}>{contact.goalsWorkedTowards}</span>
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '1rem' }}>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Clock size={12} /> Time</p>
                    <p style={{ fontWeight: 600 }}>{contact.timeSpentHours}h</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><DollarSign size={12} /> Invested</p>
                    <p style={{ fontWeight: 600 }}>${contact.amountInvested}</p>
                  </div>
                  <div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><DollarSign size={12} /> Returns</p>
                    <p style={{ fontWeight: 600 }}>${contact.returnReceived}</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {selectedContact && (
        <div className="modal-overlay" onClick={closeDetails}>
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 860 }}
          >
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                  }}
                >
                  <User size={22} />
                </div>
                <div>
                  <h2 style={{ margin: 0 }}>{selectedContact.name}</h2>
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {prettyRelationship(selectedContact.relationshipType)} {selectedContact.roleLabel ? `• ${selectedContact.roleLabel}` : ''}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    openEdit(selectedContact);
                    closeDetails();
                  }}
                >
                  <Pencil size={14} /> Edit
                </button>
                <button type="button" onClick={closeDetails}>
                  &times;
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.25rem' }}>
              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Interaction log
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.6rem', marginBottom: '0.75rem' }}>
                  <input
                    value={newLogTitle}
                    onChange={(e) => setNewLogTitle(e.target.value)}
                    placeholder="Title (e.g. Coffee chat, Follow-up call)"
                  />
                  <textarea
                    rows={3}
                    value={newLogNotes}
                    onChange={(e) => setNewLogNotes(e.target.value)}
                    placeholder="Notes (optional)"
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button type="button" className="btn-primary" onClick={addInteractionLog}>
                      Add log
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {(selectedContact.interactionLogs ?? []).length === 0 && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No interactions yet.</p>
                  )}
                  {(selectedContact.interactionLogs ?? []).map((l) => (
                    <div
                      key={l.id}
                      style={{
                        border: '1px solid var(--glass-border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '0.75rem',
                        background: 'rgba(255,255,255,0.02)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <p style={{ margin: 0, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {l.title}
                          </p>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                            {new Date(l.at).toLocaleString()}
                          </span>
                        </div>
                        {l.notes && (
                          <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{l.notes}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ color: 'var(--danger)', padding: '0.35rem 0.6rem', height: 'fit-content' }}
                        onClick={() => deleteInteractionLog(l.id)}
                        title="Delete log"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel" style={{ padding: '1.25rem' }}>
                <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Quick context
                </p>
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>{selectedContact.notes || '—'}</p>
                <div style={{ marginTop: '1rem' }}>
                  <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    <Target size={16} /> Goals
                  </p>
                  <p style={{ margin: 0 }}>{selectedContact.goalsWorkedTowards || '—'}</p>
                </div>
                <div style={{ marginTop: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Clock size={12} /> Time
                      </p>
                      <p style={{ fontWeight: 600 }}>{selectedContact.timeSpentHours}h</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <DollarSign size={12} /> Invested
                      </p>
                      <p style={{ fontWeight: 600 }}>${selectedContact.amountInvested}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <DollarSign size={12} /> Returns
                      </p>
                      <p style={{ fontWeight: 600 }}>${selectedContact.returnReceived}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="modal-content">
            <div className="modal-header">
              <h2>Save Contact</h2>
              <button onClick={() => setShowModal(false)}>&times;</button>
            </div>
            
            <div className="form-group">
              <label>Name</label>
              <input type="text" value={contactForm.name} onChange={e => setContactForm({...contactForm, name: e.target.value})} />
            </div>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>What they can do for you</label>
                <textarea rows={2} value={contactForm.canDoForYou} onChange={e => setContactForm({...contactForm, canDoForYou: e.target.value})} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>What you can do for them</label>
                <textarea rows={2} value={contactForm.canDoForThem} onChange={e => setContactForm({...contactForm, canDoForThem: e.target.value})} />
              </div>
            </div>

            <div className="form-group">
              <label>Shared Goals</label>
              <input type="text" value={contactForm.goalsWorkedTowards} onChange={e => setContactForm({...contactForm, goalsWorkedTowards: e.target.value})} placeholder="e.g. Build startup MVP" />
            </div>
            <div className="form-group">
              <label>Specific Role / Title</label>
              <input
                type="text"
                value={contactForm.roleLabel ?? ''}
                onChange={e => setContactForm({ ...contactForm, roleLabel: e.target.value })}
                placeholder="e.g. Hairdresser, Cousin, Manager at Whole Foods"
              />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea
                rows={3}
                value={contactForm.notes ?? ''}
                onChange={e => setContactForm({ ...contactForm, notes: e.target.value })}
                placeholder="Anything useful to remember about this person..."
              />
            </div>

            {data.places.length > 0 && (
              <div className="form-group">
                <label>Places</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.35rem' }}>
                  {data.places.map((p) => {
                    const on = (contactForm.placeLinks ?? []).some((pl) => pl.placeId === p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => togglePlaceForForm(p.id)}
                        style={{
                          padding: '0.4rem 0.85rem',
                          borderRadius: '9999px',
                          fontSize: '0.875rem',
                          border: `1px solid ${on ? 'var(--primary)' : 'var(--glass-border)'}`,
                          background: on ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                          color: on ? 'white' : 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        <MapPin size={14} />
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="form-group">
              <label>Value Status</label>
              <select value={contactForm.status} onChange={e => setContactForm({...contactForm, status: e.target.value as Contact['status']})}>
                <option value="useful">Useful</option>
                <option value="neutral">Neutral</option>
                <option value="not-useful">Not Useful / Liability</option>
              </select>
            </div>
            <div className="form-group">
              <label>Relationship Type</label>
              <select
                value={contactForm.relationshipType ?? 'acquaintance'}
                onChange={(e) => setContactForm({ ...contactForm, relationshipType: e.target.value as Contact['relationshipType'] })}
              >
                <option value="family">Family</option>
                <option value="friend">Friend</option>
                <option value="acquaintance">Acquaintance</option>
                <option value="client">Client</option>
                <option value="employee">Employee</option>
                <option value="partner">Partner</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Time Invested (hours)</label>
                <input
                  type="number"
                  value={contactForm.timeSpentHours ?? 0}
                  onChange={(e) => setContactForm({ ...contactForm, timeSpentHours: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Amount Invested ($)</label>
                <input
                  type="number"
                  value={contactForm.amountInvested ?? 0}
                  onChange={(e) => setContactForm({ ...contactForm, amountInvested: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Returns ($)</label>
                <input
                  type="number"
                  value={contactForm.returnReceived ?? 0}
                  onChange={(e) => setContactForm({ ...contactForm, returnReceived: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
              <button className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave}>{editingContactId ? 'Save Changes' : 'Save'}</button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
export default NetworkView;
