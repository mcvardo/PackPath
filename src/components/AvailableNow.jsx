import { useState, useEffect } from 'react';
import { COLORS } from '../styles/tokens.js';

/**
 * Shows regions with permit availability for the next 2 weekends.
 * Clicking a region pre-fills the form with that region + dates.
 */
export function AvailableNow({ onSelect }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/available-now')
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (!data?.available?.length) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{
        fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: 0.8, color: COLORS.stone400, margin: '0 0 10px 0',
      }}>
        Available this weekend
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {data.available.map(region => (
          <button
            key={region.regionId}
            onClick={() => onSelect(region)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 20,
              background: '#fff',
              border: `1px solid ${COLORS.stone200}`,
              fontSize: 13,
              fontWeight: 600,
              color: COLORS.stone700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = COLORS.emerald400;
              e.currentTarget.style.color = COLORS.emerald700;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = COLORS.stone200;
              e.currentTarget.style.color = COLORS.stone700;
            }}
          >
            {region.permitRequired ? '🎫' : '✓'} {region.regionName}
          </button>
        ))}
      </div>
      <p style={{ fontSize: 11, color: COLORS.stone400, margin: '8px 0 0 0' }}>
        Permits available for {data.weekends?.[0] || 'upcoming weekends'} · Click to plan a trip
      </p>
    </div>
  );
}
