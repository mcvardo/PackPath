import { useState, useEffect } from 'react';
import { COLORS } from '../styles/tokens.js';

const SCENERY_OPTIONS = [
  'lakes', 'peaks', 'passes', 'meadows', 'forest', 'streams', 'ridgeline',
];

const inputBase = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 14,
  border: `1px solid ${COLORS.stone300}`,
  background: '#fff',
  color: COLORS.stone800,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

const labelStyle = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: COLORS.stone600,
  marginBottom: 4,
};

function daysBetween(start, end) {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : null;
}

/**
 * Trip preferences form — always visible inline.
 * Accepts externalPrefs to sync with AI chat collected values.
 */
export function PreferenceForm({ onSubmit, isLoading, externalPrefs = {} }) {
  const [form, setForm] = useState({
    location: '',
    startDate: '',
    endDate: '',
    milesPerDayTarget: 10,
    elevationTolerance: 'moderate',
    sceneryPreferences: [],
    crowdPreference: 'mixed',
    experienceLevel: 'intermediate',
    groupType: 'couple',
    avoid: '',
    priorities: '',
    notes: '',
  });

  // Sync external prefs from chat into the form
  useEffect(() => {
    if (!externalPrefs || Object.keys(externalPrefs).length === 0) return;
    setForm(prev => {
      const next = { ...prev };
      if (externalPrefs.location) next.location = externalPrefs.location;
      if (externalPrefs.startDate) next.startDate = externalPrefs.startDate;
      if (externalPrefs.endDate) next.endDate = externalPrefs.endDate;
      if (externalPrefs.milesPerDayTarget) next.milesPerDayTarget = externalPrefs.milesPerDayTarget;
      if (externalPrefs.elevationTolerance) next.elevationTolerance = externalPrefs.elevationTolerance;
      if (Array.isArray(externalPrefs.sceneryPreferences) && externalPrefs.sceneryPreferences.length > 0) {
        next.sceneryPreferences = externalPrefs.sceneryPreferences;
      }
      if (externalPrefs.crowdPreference) next.crowdPreference = externalPrefs.crowdPreference;
      if (externalPrefs.experienceLevel) next.experienceLevel = externalPrefs.experienceLevel;
      if (externalPrefs.groupType) next.groupType = externalPrefs.groupType;
      if (externalPrefs.avoid) next.avoid = externalPrefs.avoid;
      if (externalPrefs.priorities) next.priorities = externalPrefs.priorities;
      if (externalPrefs.notes) next.notes = externalPrefs.notes;
      return next;
    });
  }, [externalPrefs]);

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const toggleScenery = (s) => {
    update('sceneryPreferences',
      form.sceneryPreferences.includes(s)
        ? form.sceneryPreferences.filter(x => x !== s)
        : [...form.sceneryPreferences, s]
    );
  };

  const days = daysBetween(form.startDate, form.endDate);

  const handleSubmit = () => {
    if (onSubmit) {
      const prefs = { ...form };
      if (days) prefs.daysTarget = days;
      if (prefs.location) prefs.region = prefs.location;
      onSubmit(prefs);
    }
  };

  return (
    <div style={{
      background: '#fff',
      borderRadius: 10,
      padding: 20,
      border: `1px solid ${COLORS.stone200}`,
    }}>
      {/* Location */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Where are you going?</label>
        <input
          type="text"
          value={form.location}
          placeholder="e.g. Glacier National Park, Wind River Range..."
          onChange={e => update('location', e.target.value)}
          style={inputBase}
        />
      </div>

      {/* Dates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
        <div>
          <label style={labelStyle}>Start Date</label>
          <input
            type="date"
            value={form.startDate}
            onChange={e => update('startDate', e.target.value)}
            style={inputBase}
          />
        </div>
        <div>
          <label style={labelStyle}>End Date</label>
          <input
            type="date"
            value={form.endDate}
            onChange={e => update('endDate', e.target.value)}
            style={inputBase}
          />
        </div>
      </div>
      {days && (
        <p style={{ fontSize: 12, color: COLORS.emerald700, margin: '4px 0 16px 0', fontWeight: 600 }}>
          {days} day{days !== 1 ? 's' : ''}
        </p>
      )}
      {!days && <div style={{ marginBottom: 16 }} />}

      {/* Miles per day */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Miles / Day</label>
        <input
          type="number"
          min={3}
          max={25}
          value={form.milesPerDayTarget}
          onChange={e => update('milesPerDayTarget', +e.target.value)}
          style={inputBase}
        />
      </div>

      {/* Elevation */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Elevation Tolerance</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['easy', 'moderate', 'hard'].map(lvl => (
            <button key={lvl} onClick={() => update('elevationTolerance', lvl)} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize',
              background: form.elevationTolerance === lvl ? COLORS.emerald600 : COLORS.stone100,
              color: form.elevationTolerance === lvl ? '#fff' : COLORS.stone600,
              border: `1px solid ${form.elevationTolerance === lvl ? COLORS.emerald600 : COLORS.stone300}`,
              fontFamily: 'inherit',
            }}>
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Scenery */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Scenery Preferences</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SCENERY_OPTIONS.map(s => {
            const active = form.sceneryPreferences.includes(s);
            return (
              <button key={s} onClick={() => toggleScenery(s)} style={{
                padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize',
                background: active ? COLORS.emerald600 : '#fff',
                color: active ? '#fff' : COLORS.stone600,
                border: `1px solid ${active ? COLORS.emerald600 : COLORS.stone300}`,
                fontFamily: 'inherit',
              }}>
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Crowd */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Crowd Preference</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['solitude', 'mixed', 'popular is fine'].map(opt => (
            <button key={opt} onClick={() => update('crowdPreference', opt)} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', textTransform: 'capitalize',
              background: form.crowdPreference === opt ? COLORS.emerald600 : COLORS.stone100,
              color: form.crowdPreference === opt ? '#fff' : COLORS.stone600,
              border: `1px solid ${form.crowdPreference === opt ? COLORS.emerald600 : COLORS.stone300}`,
              fontFamily: 'inherit',
            }}>
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Experience + Group */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Experience Level</label>
          <select value={form.experienceLevel} onChange={e => update('experienceLevel', e.target.value)} style={inputBase}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Group Type</label>
          <select value={form.groupType} onChange={e => update('groupType', e.target.value)} style={inputBase}>
            <option value="solo">Solo</option>
            <option value="couple">Couple</option>
            <option value="small group">Small Group (3–4)</option>
            <option value="large group">Large Group (5+)</option>
          </select>
        </div>
      </div>

      {/* Avoid */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Avoid</label>
        <input
          type="text"
          value={form.avoid}
          placeholder="e.g., long stretches without water"
          onChange={e => update('avoid', e.target.value)}
          style={inputBase}
        />
      </div>

      {/* Priorities */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Priorities</label>
        <input
          type="text"
          value={form.priorities}
          placeholder="e.g., alpine lakes, variety of terrain"
          onChange={e => update('priorities', e.target.value)}
          style={inputBase}
        />
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={form.notes}
          rows={3}
          placeholder="Anything else the AI should know..."
          onChange={e => update('notes', e.target.value)}
          style={{ ...inputBase, resize: 'vertical' }}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={isLoading}
        style={{
          width: '100%',
          padding: '12px 0',
          borderRadius: 10,
          fontSize: 15,
          fontWeight: 700,
          cursor: isLoading ? 'not-allowed' : 'pointer',
          opacity: isLoading ? 0.7 : 1,
          background: COLORS.emerald600,
          color: '#fff',
          border: 'none',
          fontFamily: 'inherit',
        }}
      >
        {isLoading ? 'Finding routes…' : '⛰ Find Routes'}
      </button>
    </div>
  );
}
