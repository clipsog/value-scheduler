import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppData } from '../context/AppDataContext';
import type { Asset, ClothingItem, ClothingStyle, Contact, ContactPlaceLink, InteractionLog, Place } from '../context/AppDataContext';
import { Plus, TrendingUp, MapPin, Users, Trash2, Edit3 } from 'lucide-react';

type AssetsTab = 'items' | 'places' | 'clothing';

const AssetsView = () => {
  const { data, addAsset, updateAsset, addPlace, updatePlace, deletePlace, updateContact, addClothingItem, deleteClothingItem } =
    useAppData();
  const [tab, setTab] = useState<AssetsTab>('items');
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showPlaceModal, setShowPlaceModal] = useState(false);
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [newPlaceLogTitle, setNewPlaceLogTitle] = useState('');
  const [newPlaceLogNotes, setNewPlaceLogNotes] = useState('');
  const [newAsset, setNewAsset] = useState<Partial<Asset>>({
    name: '',
    category: '',
    condition: 'excellent',
    usageCount: 0,
  });
  const [placeForm, setPlaceForm] = useState<Partial<Place>>({
    name: '',
    category: '',
    address: '',
    notes: '',
  });
  const [editingPlaceContact, setEditingPlaceContact] = useState<{
    contactId: string;
    placeId: string;
    typicalTimes: string;
    notes: string;
  } | null>(null);
  const [clothingKind, setClothingKind] = useState<'owned' | 'wishlist'>('owned');
  const [clothingForm, setClothingForm] = useState<Partial<ClothingItem>>({
    name: '',
    style: 'casual',
    brand: '',
    color: '',
    size: '',
    imageUrl: '',
    link: '',
  });

  const handleSaveAsset = () => {
    if (newAsset.name) {
      addAsset(newAsset as Omit<Asset, 'id'>);
      setShowAssetModal(false);
      setNewAsset({ name: '', category: '', condition: 'excellent', usageCount: 0 });
    }
  };

  const openPlaceModal = (place?: Place) => {
    if (place) {
      setEditingPlaceId(place.id);
      setPlaceForm({
        name: place.name,
        category: place.category,
        address: place.address ?? '',
        notes: place.notes ?? '',
      });
    } else {
      setEditingPlaceId(null);
      setPlaceForm({ name: '', category: '', address: '', notes: '' });
    }
    setShowPlaceModal(true);
  };

  const selectedPlace = useMemo(
    () => data.places.find((p) => p.id === selectedPlaceId) ?? null,
    [data.places, selectedPlaceId],
  );

  const openPlaceDetails = (placeId: string) => {
    setSelectedPlaceId(placeId);
    setNewPlaceLogTitle('');
    setNewPlaceLogNotes('');
  };

  const closePlaceDetails = () => {
    setSelectedPlaceId(null);
    setNewPlaceLogTitle('');
    setNewPlaceLogNotes('');
  };

  const addPlaceInteractionLog = () => {
    if (!selectedPlace) return;
    const title = newPlaceLogTitle.trim();
    const notes = newPlaceLogNotes.trim();
    if (!title && !notes) return;
    const next: InteractionLog = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      title: title || 'Interaction',
      notes: notes || undefined,
    };
    const logs = Array.isArray(selectedPlace.interactionLogs) ? selectedPlace.interactionLogs : [];
    updatePlace(selectedPlace.id, { interactionLogs: [next, ...logs] });
    setNewPlaceLogTitle('');
    setNewPlaceLogNotes('');
  };

  const deletePlaceInteractionLog = (logId: string) => {
    if (!selectedPlace) return;
    const logs = Array.isArray(selectedPlace.interactionLogs) ? selectedPlace.interactionLogs : [];
    updatePlace(selectedPlace.id, { interactionLogs: logs.filter((l) => l.id !== logId) });
  };

  const handleSavePlace = () => {
    if (!placeForm.name?.trim()) return;
    if (editingPlaceId) {
      updatePlace(editingPlaceId, {
        name: placeForm.name.trim(),
        category: (placeForm.category ?? '').trim(),
        address: (placeForm.address ?? '').trim() || undefined,
        notes: placeForm.notes?.trim() || undefined,
      });
    } else {
      addPlace({
        name: placeForm.name.trim(),
        category: (placeForm.category ?? '').trim() || 'General',
        address: (placeForm.address ?? '').trim() || undefined,
        notes: placeForm.notes?.trim() || undefined,
      });
    }
    setShowPlaceModal(false);
    setEditingPlaceId(null);
  };

  const toggleContactAtPlace = (placeId: string, contactId: string) => {
    const contact = data.contacts.find((c) => c.id === contactId);
    if (!contact) return;
    const links = contact.placeLinks ?? [];
    const linked = links.some((pl) => pl.placeId === placeId);
    const placeLinks = linked
      ? links.filter((pl) => pl.placeId !== placeId)
      : [...links, { placeId }];
    updateContact(contactId, { placeLinks, placeIds: placeLinks.map((pl) => pl.placeId) });
  };

  const contactsForPlace = (placeId: string) =>
    data.contacts.filter((c) => (c.placeLinks ?? []).some((pl) => pl.placeId === placeId));

  const getLink = (contact: Contact, placeId: string): ContactPlaceLink | undefined =>
    (contact.placeLinks ?? []).find((pl) => pl.placeId === placeId);

  const openContactPlaceEditor = (contact: Contact, placeId: string) => {
    const link = getLink(contact, placeId);
    setEditingPlaceContact({
      contactId: contact.id,
      placeId,
      typicalTimes: link?.typicalTimes ?? '',
      notes: link?.notes ?? '',
    });
  };

  const saveContactPlaceEditor = () => {
    if (!editingPlaceContact) return;
    const contact = data.contacts.find((c) => c.id === editingPlaceContact.contactId);
    if (!contact) return;
    const cur = contact.placeLinks ?? [];
    const hasLink = cur.some((pl) => pl.placeId === editingPlaceContact.placeId);
    const nextLink: ContactPlaceLink = {
      placeId: editingPlaceContact.placeId,
      typicalTimes: editingPlaceContact.typicalTimes.trim() || undefined,
      notes: editingPlaceContact.notes.trim() || undefined,
    };
    const placeLinks = hasLink
      ? cur.map((pl) => (pl.placeId === editingPlaceContact.placeId ? nextLink : pl))
      : [...cur, nextLink];
    updateContact(contact.id, { placeLinks, placeIds: placeLinks.map((pl) => pl.placeId) });
    setEditingPlaceContact(null);
  };

  const conditionColors = {
    excellent: 'var(--success)',
    good: 'var(--primary)',
    'maintenance-needed': 'var(--warning)',
    sell: 'var(--danger)',
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Assets Manager</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {tab === 'items' ? (
            <button className="btn-primary" onClick={() => setShowAssetModal(true)}>
              <Plus size={20} /> Add Asset
            </button>
          ) : (
            <button className="btn-primary" onClick={() => openPlaceModal()}>
              <Plus size={20} /> Add Place
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          padding: '0.25rem',
          background: 'rgba(255,255,255,0.03)',
          borderRadius: 'var(--radius-md)',
          width: 'fit-content',
        }}
      >
        <button
          type="button"
          className={tab === 'items' ? 'btn-primary' : 'btn-secondary'}
          style={{ padding: '0.5rem 1rem' }}
          onClick={() => setTab('items')}
        >
          Items
        </button>
        <button
          type="button"
          className={tab === 'places' ? 'btn-primary' : 'btn-secondary'}
          style={{ padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          onClick={() => setTab('places')}
        >
          <MapPin size={16} />
          Places
        </button>
        <button
          type="button"
          className={tab === 'clothing' ? 'btn-primary' : 'btn-secondary'}
          style={{ padding: '0.5rem 1rem' }}
          onClick={() => setTab('clothing')}
        >
          Clothing
        </button>
      </div>

      {tab === 'items' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {data.assets.map((asset) => (
            <motion.div
              key={asset.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-panel"
              style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '4px',
                  height: '100%',
                  background: conditionColors[asset.condition],
                }}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '1rem',
                }}
              >
                <div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {asset.category}
                  </span>
                  <h3 style={{ fontSize: '1.25rem', marginTop: '0.25rem' }}>{asset.name}</h3>
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Usage</p>
                  <p style={{ fontWeight: 600, fontSize: '1.125rem' }}>{asset.usageCount} times</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Condition</p>
                  <p
                    style={{
                      color: conditionColors[asset.condition],
                      fontWeight: 500,
                      textTransform: 'capitalize',
                    }}
                  >
                    {asset.condition.replace('-', ' ')}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn-secondary"
                  style={{ flex: 1, padding: '0.5rem' }}
                  onClick={() => updateAsset(asset.id, { usageCount: asset.usageCount + 1 })}
                >
                  <TrendingUp size={16} /> Use
                </button>
                <select
                  value={asset.condition}
                  onChange={(e) => updateAsset(asset.id, { condition: e.target.value as Asset['condition'] })}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: 'white',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <option value="excellent" style={{ background: 'var(--bg-base)' }}>
                    Excellent
                  </option>
                  <option value="good" style={{ background: 'var(--bg-base)' }}>
                    Good
                  </option>
                  <option value="maintenance-needed" style={{ background: 'var(--bg-base)' }}>
                    Needs Maint.
                  </option>
                  <option value="sell" style={{ background: 'var(--bg-base)' }}>
                    Sell / Replace
                  </option>
                </select>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {tab === 'clothing' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-panel" style={{ padding: '1.25rem' }}>
            <h2 style={{ fontSize: '1.1rem', marginBottom: '0.75rem' }}>Add clothing</h2>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className={clothingKind === 'owned' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setClothingKind('owned')}
              >
                Owned wardrobe
              </button>
              <button
                type="button"
                className={clothingKind === 'wishlist' ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setClothingKind('wishlist')}
              >
                Wishlist
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '0.75rem' }}>
              <div className="form-group">
                <label>Name</label>
                <input
                  value={clothingForm.name ?? ''}
                  onChange={(e) => setClothingForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Navy blazer"
                />
              </div>
              <div className="form-group">
                <label>Style</label>
                <select
                  value={(clothingForm.style as ClothingStyle) ?? 'casual'}
                  onChange={(e) => setClothingForm((f) => ({ ...f, style: e.target.value as ClothingStyle }))}
                >
                  <option value="formal">Formal</option>
                  <option value="casual">Casual</option>
                  <option value="sportswear">Sportswear</option>
                  <option value="sneakers">Sneakers</option>
                  <option value="sandals">Sandals</option>
                  <option value="underwear">Underwear</option>
                  <option value="socks">Socks</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Brand</label>
                <input
                  value={clothingForm.brand ?? ''}
                  onChange={(e) => setClothingForm((f) => ({ ...f, brand: e.target.value }))}
                  placeholder="Uniqlo, Nike…"
                />
              </div>
              <div className="form-group">
                <label>Color</label>
                <input
                  value={clothingForm.color ?? ''}
                  onChange={(e) => setClothingForm((f) => ({ ...f, color: e.target.value }))}
                  placeholder="Navy, white/black…"
                />
              </div>
              <div className="form-group">
                <label>Size</label>
                <input
                  value={clothingForm.size ?? ''}
                  onChange={(e) => setClothingForm((f) => ({ ...f, size: e.target.value }))}
                  placeholder="M, 30x30, US 9…"
                />
              </div>
              <div className="form-group">
                <label>Image URL</label>
                <input
                  value={clothingForm.imageUrl ?? ''}
                  onChange={(e) => setClothingForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  placeholder="https://…"
                />
              </div>
              {clothingKind === 'wishlist' && (
                <div className="form-group">
                  <label>Product link</label>
                  <input
                    value={clothingForm.link ?? ''}
                    onChange={(e) => setClothingForm((f) => ({ ...f, link: e.target.value }))}
                    placeholder="Store/product URL"
                  />
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setClothingForm({
                    name: '',
                    style: 'casual',
                    brand: '',
                    color: '',
                    size: '',
                    imageUrl: '',
                    link: '',
                  })
                }
              >
                Clear
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  if (!clothingForm.name?.trim()) return;
                  addClothingItem(clothingKind, {
                    name: clothingForm.name.trim(),
                    style: (clothingForm.style as ClothingStyle) ?? 'casual',
                    brand: (clothingForm.brand ?? '').trim(),
                    color: (clothingForm.color ?? '').trim(),
                    size: (clothingForm.size ?? '').trim(),
                    imageUrl: (clothingForm.imageUrl ?? '').trim() || undefined,
                    link: (clothingForm.link ?? '').trim() || undefined,
                  });
                  setClothingForm({
                    name: '',
                    style: clothingForm.style ?? 'casual',
                    brand: '',
                    color: '',
                    size: '',
                    imageUrl: '',
                    link: '',
                  });
                }}
              >
                Add to {clothingKind === 'owned' ? 'wardrobe' : 'wishlist'}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '1.5rem', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>Wardrobe (owned)</h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))',
                  gap: '1rem',
                }}
              >
                {data.clothing.filter((c) => c.kind === 'owned').length === 0 && (
                  <p style={{ color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
                    No clothing saved yet. Add pieces you already own so you can plan outfits and avoid duplicates.
                  </p>
                )}
                {data.clothing
                  .filter((c) => c.kind === 'owned')
                  .map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass-panel"
                      style={{ padding: '1rem', display: 'flex', gap: '0.75rem' }}
                    >
                      {item.imageUrl && (
                        <div
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: '0.75rem',
                            overflow: 'hidden',
                            flexShrink: 0,
                            background: 'rgba(15,23,42,0.9)',
                          }}
                        >
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{item.name}</h4>
                            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {item.brand || 'Unknown brand'} • {item.style}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ padding: '0.25rem 0.55rem', color: 'var(--danger)' }}
                            onClick={() => deleteClothingItem(item.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {item.color || 'No color set'} • {item.size || 'No size set'}
                        </p>
                      </div>
                    </motion.div>
                  ))}
              </div>
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', marginBottom: '0.75rem' }}>Wishlist</h3>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))',
                  gap: '1rem',
                }}
              >
                {data.clothing.filter((c) => c.kind === 'wishlist').length === 0 && (
                  <p style={{ color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
                    No wishlist items yet. Save links to clothing you might want to buy later.
                  </p>
                )}
                {data.clothing
                  .filter((c) => c.kind === 'wishlist')
                  .map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="glass-panel"
                      style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{item.name}</h4>
                          <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {item.brand || 'Unknown brand'} • {item.style}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ padding: '0.25rem 0.55rem', color: 'var(--danger)' }}
                          onClick={() => deleteClothingItem(item.id)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {item.color || 'No color set'} • {item.size || 'No size set'}
                      </p>
                      {item.link && (
                        <a
                          href={item.link}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            marginTop: '0.25rem',
                            fontSize: '0.8rem',
                            color: 'var(--primary)',
                            textDecoration: 'underline',
                            wordBreak: 'break-all',
                          }}
                        >
                          View product
                        </a>
                      )}
                    </motion.div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'places' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {data.places.length === 0 && (
            <p style={{ color: 'var(--text-muted)', gridColumn: '1 / -1' }}>
              No places yet. Add gyms, stores, offices—then tag them on the schedule and link people from
              Network.
            </p>
          )}
          {data.places.map((place) => (
            <motion.div
              key={place.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel"
              style={{ padding: '1.5rem', position: 'relative', cursor: 'pointer' }}
              onClick={() => openPlaceDetails(place.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') openPlaceDetails(place.id);
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'rgba(99, 102, 241, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--primary)',
                    }}
                  >
                    <MapPin size={22} />
                  </div>
                  <div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {place.category}
                    </span>
                    <h3 style={{ fontSize: '1.2rem', margin: '0.15rem 0 0' }}>{place.name}</h3>
                    {place.address && (
                      <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                        {place.address}
                      </p>
                    )}
                    {place.notes && (
                      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        {place.notes}
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.35rem 0.6rem' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      openPlaceModal(place);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ padding: '0.35rem 0.6rem', color: 'var(--danger)' }}
                    title="Delete place"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete “${place.name}”? Links on events and contacts will be cleared.`)) {
                        deletePlace(place.id);
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div style={{ marginTop: '1.25rem' }}>
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
                  <Users size={14} /> People at this place
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {data.contacts.length === 0 && (
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      Add contacts in Network first.
                    </span>
                  )}
                  {data.contacts.map((c) => {
                    const on = (c.placeLinks ?? []).some((pl) => pl.placeId === place.id);
                    const link = getLink(c, place.id);
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleContactAtPlace(place.id, c.id);
                          }}
                          style={{
                            padding: '0.4rem 0.85rem',
                            borderRadius: '9999px',
                            border: `1px solid ${on ? 'var(--primary)' : 'var(--glass-border)'}`,
                            background: on ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                            color: on ? 'white' : 'var(--text-muted)',
                            fontSize: '0.875rem',
                          }}
                        >
                          {c.name}
                        </button>
                        {on && (
                          <button
                            type="button"
                            className="btn-secondary"
                            title="Edit times/details for this person at this place"
                            style={{ padding: '0.35rem 0.55rem' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openContactPlaceEditor(c, place.id);
                            }}
                          >
                            <Edit3 size={14} />
                          </button>
                        )}
                        {on && link?.typicalTimes && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{link.typicalTimes}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {contactsForPlace(place.id).length > 0 && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
                    {contactsForPlace(place.id).length} linked
                  </p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {selectedPlace && (
        <div className="modal-overlay" onClick={closePlaceDetails}>
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 900 }}
          >
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: 'rgba(99, 102, 241, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary)',
                  }}
                >
                  <MapPin size={22} />
                </div>
                <div>
                  <h2 style={{ margin: 0 }}>{selectedPlace.name}</h2>
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    {selectedPlace.category}
                    {selectedPlace.address ? ` • ${selectedPlace.address}` : ''}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    openPlaceModal(selectedPlace);
                    closePlaceDetails();
                  }}
                >
                  Edit
                </button>
                <button type="button" onClick={closePlaceDetails}>
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
                    value={newPlaceLogTitle}
                    onChange={(e) => setNewPlaceLogTitle(e.target.value)}
                    placeholder="Title (e.g. Visit, Observation, Idea)"
                  />
                  <textarea
                    rows={3}
                    value={newPlaceLogNotes}
                    onChange={(e) => setNewPlaceLogNotes(e.target.value)}
                    placeholder="Notes (optional)"
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <button type="button" className="btn-primary" onClick={addPlaceInteractionLog}>
                      Add log
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {(selectedPlace.interactionLogs ?? []).length === 0 && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No interactions yet.</p>
                  )}
                  {(selectedPlace.interactionLogs ?? []).map((l) => (
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
                        onClick={() => deletePlaceInteractionLog(l.id)}
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
                  Notes
                </p>
                <p style={{ margin: 0, color: 'var(--text-muted)' }}>{selectedPlace.notes || '—'}</p>
                <div style={{ marginTop: '1.25rem' }}>
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
                    <Users size={14} /> People linked here
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {contactsForPlace(selectedPlace.id).length === 0 && (
                      <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>None yet.</span>
                    )}
                    {contactsForPlace(selectedPlace.id).map((c) => (
                      <span
                        key={c.id}
                        style={{
                          padding: '0.35rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.85rem',
                          border: '1px solid var(--glass-border)',
                          color: 'var(--text-muted)',
                        }}
                      >
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showAssetModal && (
        <div className="modal-overlay">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="modal-content"
          >
            <div className="modal-header">
              <h2>Add Asset</h2>
              <button type="button" onClick={() => setShowAssetModal(false)}>
                &times;
              </button>
            </div>

            <div className="form-group">
              <label>Asset Name</label>
              <input
                type="text"
                value={newAsset.name}
                onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                placeholder="e.g. Daily Driver Car, Basketball Shoes"
              />
            </div>

            <div className="form-group">
              <label>Category</label>
              <input
                type="text"
                value={newAsset.category}
                onChange={(e) => setNewAsset({ ...newAsset, category: e.target.value })}
                placeholder="e.g. Vehicles, Gear"
              />
            </div>

            <div className="form-group">
              <label>Condition</label>
              <select
                value={newAsset.condition}
                onChange={(e) =>
                  setNewAsset({ ...newAsset, condition: e.target.value as Asset['condition'] })
                }
              >
                <option value="excellent">Excellent</option>
                <option value="good">Good</option>
                <option value="maintenance-needed">Needs Maintenance</option>
                <option value="sell">To Sell</option>
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
              <button type="button" className="btn-secondary" onClick={() => setShowAssetModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleSaveAsset}>
                Save Asset
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {showPlaceModal && (
        <div className="modal-overlay">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="modal-content"
          >
            <div className="modal-header">
              <h2>{editingPlaceId ? 'Edit Place' : 'Add Place'}</h2>
              <button
                type="button"
                onClick={() => {
                  setShowPlaceModal(false);
                  setEditingPlaceId(null);
                }}
              >
                &times;
              </button>
            </div>

            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={placeForm.name}
                onChange={(e) => setPlaceForm({ ...placeForm, name: e.target.value })}
                placeholder="e.g. Downtown Gym, Whole Foods"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Category</label>
              <input
                type="text"
                value={placeForm.category}
                onChange={(e) => setPlaceForm({ ...placeForm, category: e.target.value })}
                placeholder="e.g. Gym, Groceries, Office"
              />
            </div>
            <div className="form-group">
              <label>Address</label>
              <input
                type="text"
                value={placeForm.address ?? ''}
                onChange={(e) => setPlaceForm({ ...placeForm, address: e.target.value })}
                placeholder="e.g. 123 Main St, Toronto, ON"
              />
            </div>

            <div className="form-group">
              <label>Notes (optional)</label>
              <textarea
                rows={2}
                value={placeForm.notes ?? ''}
                onChange={(e) => setPlaceForm({ ...placeForm, notes: e.target.value })}
                placeholder="Parking, hours, membership…"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowPlaceModal(false);
                  setEditingPlaceId(null);
                }}
              >
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={handleSavePlace}>
                {editingPlaceId ? 'Save' : 'Add Place'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
      {editingPlaceContact && (
        <div className="modal-overlay">
          <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="modal-content">
            <div className="modal-header">
              <h2>Person Details At This Place</h2>
              <button type="button" onClick={() => setEditingPlaceContact(null)}>
                &times;
              </button>
            </div>
            <div className="form-group">
              <label>Typical Times They Are There</label>
              <input
                type="text"
                value={editingPlaceContact.typicalTimes}
                onChange={(e) =>
                  setEditingPlaceContact((prev) => (prev ? { ...prev, typicalTimes: e.target.value } : prev))
                }
                placeholder="e.g. Mon/Wed/Fri 6:00-8:00am"
              />
            </div>
            <div className="form-group">
              <label>Notes</label>
              <textarea
                rows={3}
                value={editingPlaceContact.notes}
                onChange={(e) =>
                  setEditingPlaceContact((prev) => (prev ? { ...prev, notes: e.target.value } : prev))
                }
                placeholder="Best time to reach them there, role at location, etc."
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
              <button type="button" className="btn-secondary" onClick={() => setEditingPlaceContact(null)}>
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={saveContactPlaceEditor}>
                Save
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
export default AssetsView;
