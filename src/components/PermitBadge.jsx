import { COLORS } from '../styles/tokens.js';

/**
 * Displays permit status, lottery warnings, and seasonal guidance on a route card or detail.
 * size: 'sm' (route card) | 'lg' (route detail)
 */
export function PermitBadge({ permit, size = 'sm' }) {
  if (!permit) return null;

  const isLg = size === 'lg';
  const fontSize = isLg ? 13 : 12;
  const padding = isLg ? '6px 12px' : '4px 10px';

  // No permit required
  if (!permit.permitRequired) {
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: isLg ? 12 : 8 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding, borderRadius: 20, fontSize,
          background: '#ecfdf5', color: COLORS.emerald700,
          border: '1px solid #a7f3d0', fontWeight: 600,
        }}>
          ✓ No permit required
        </span>
        {permit.bestMonths?.length > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding, borderRadius: 20, fontSize,
            background: COLORS.amber50, color: COLORS.amber700,
            border: `1px solid ${COLORS.amber200}`, fontWeight: 500,
          }}>
            🌤 Best: {permit.bestMonths.join(', ')}
          </span>
        )}
      </div>
    );
  }

  // Lottery
  if (permit.isLottery) {
    const lotteryText = permit.lotteryWindow
      ? `Lottery opens ${formatMonthDay(permit.lotteryWindow.open)}`
      : 'Lottery required';

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: isLg ? 12 : 8 }}>
        <a
          href={permit.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding, borderRadius: 20, fontSize,
            background: '#fef3c7', color: COLORS.amber700,
            border: `1px solid ${COLORS.amber200}`, fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          ⚠ {lotteryText} →
        </a>
        {permit.bestMonths?.length > 0 && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding, borderRadius: 20, fontSize,
            background: COLORS.stone100, color: COLORS.stone600,
            border: `1px solid ${COLORS.stone200}`, fontWeight: 500,
          }}>
            🌤 Best: {permit.bestMonths.join(', ')}
          </span>
        )}
      </div>
    );
  }

  // Permit required — with or without live availability
  const availColor = permit.availabilityChecked
    ? (permit.available ? '#ecfdf5' : '#fef2f2')
    : COLORS.stone100;
  const availTextColor = permit.availabilityChecked
    ? (permit.available ? COLORS.emerald700 : COLORS.hardRed)
    : COLORS.stone600;
  const availBorder = permit.availabilityChecked
    ? (permit.available ? '#a7f3d0' : '#fecaca')
    : COLORS.stone200;
  const availText = permit.availabilityChecked
    ? (permit.available ? `Permit available (${permit.availableCount} dates)` : 'Sold out for these dates')
    : 'Permit required';

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: isLg ? 12 : 8 }}>
      <a
        href={permit.bookingUrl || '#'}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding, borderRadius: 20, fontSize,
          background: availColor, color: availTextColor,
          border: `1px solid ${availBorder}`, fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        🎫 {availText} →
      </a>
      {permit.bestMonths?.length > 0 && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding, borderRadius: 20, fontSize,
          background: COLORS.amber50, color: COLORS.amber700,
          border: `1px solid ${COLORS.amber200}`, fontWeight: 500,
        }}>
          🌤 Best: {permit.bestMonths.join(', ')}
        </span>
      )}
      {permit.notes && isLg && (
        <p style={{ fontSize: 12, color: COLORS.stone500, margin: '6px 0 0 0', width: '100%', lineHeight: 1.5 }}>
          {permit.notes}
        </p>
      )}
    </div>
  );
}

function formatMonthDay(mmdd) {
  if (!mmdd) return '';
  const [, m, d] = mmdd.match(/(\d{2})-(\d{2})/) || [];
  if (!m) return mmdd;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}`;
}
