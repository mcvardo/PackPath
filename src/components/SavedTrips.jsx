import { COLORS } from '../styles/tokens.js';
import { fmtMi, fmt } from '../utils/hiking.js';
import { PermitBadge } from './PermitBadge.jsx';
import { usePermit } from '../hooks/usePermit.js';

function SavedTripRow({ trip, onRemove, onView }) {
  const { permit } = usePermit(trip.regionId, trip.startDate);

  const dateLabel = trip.startDate && trip.endDate
    ? `${trip.startDate} → ${trip.endDate}`
    : trip.startDate || null;

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${COLORS.stone200}`,
      borderRadius: 10,
      padding: 14,
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: COLORS.stone800, margin: '0 0 4px 0', lineHeight: 1.3 }}>
            {trip.routeName}
          </p>
          <p style={{ fontSize: 12, color: COLORS.stone500, margin: '0 0 4px 0' }}>
            {fmtMi(trip.totalMiles)} mi · +{fmt(trip.totalGainFt)} ft · {trip.days} days
            {dateLabel && ` · ${dateLabel}`}
          </p>
          <PermitBadge permit={permit} size="sm" />
        </div>
        <div style={{ display: 'flex', gap: 6, marginLeft: 8, flexShrink: 0 }}>
          <button
            onClick={() => onView(trip)}
            style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: COLORS.emerald600, color: '#fff', border: 'none', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            View
          </button>
          <button
            onClick={() => onRemove(trip.id)}
            style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              background: COLORS.stone100, color: COLORS.stone500, border: 'none', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

export function SavedTrips({ trips, onRemove, onView }) {
  if (trips.length === 0) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <p style={{
        fontSize: 12, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: 0.8, color: COLORS.stone400, margin: '0 0 10px 0',
      }}>
        Saved Trips ({trips.length})
      </p>
      {trips.map(trip => (
        <SavedTripRow key={trip.id} trip={trip} onRemove={onRemove} onView={onView} />
      ))}
    </div>
  );
}
