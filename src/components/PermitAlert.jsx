import { useState } from 'react';
import { COLORS } from '../styles/tokens.js';

/**
 * Email signup for permit availability alerts.
 * Shows on route detail when a permit is required and not lottery-based.
 */
export function PermitAlert({ regionId, permitName, startDate, endDate }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [message, setMessage] = useState('');

  if (!regionId || !permitName) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.includes('@')) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, regionId, startDate, endDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus('done');
      setMessage(data.message);
    } catch (err) {
      setStatus('error');
      setMessage(err.message);
    }
  };

  if (status === 'done') {
    return (
      <div style={{
        background: '#ecfdf5',
        border: '1px solid #a7f3d0',
        borderRadius: 10,
        padding: 14,
        marginTop: 12,
        fontSize: 13,
        color: COLORS.emerald700,
        fontWeight: 600,
      }}>
        ✓ {message}
      </div>
    );
  }

  return (
    <div style={{
      background: COLORS.stone50,
      border: `1px solid ${COLORS.stone200}`,
      borderRadius: 10,
      padding: 14,
      marginTop: 12,
    }}>
      <p style={{ fontSize: 13, fontWeight: 600, color: COLORS.stone700, margin: '0 0 8px 0' }}>
        🔔 Get notified when permits open
      </p>
      <p style={{ fontSize: 12, color: COLORS.stone500, margin: '0 0 10px 0' }}>
        We'll email you when {permitName} availability opens for your dates.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            border: `1px solid ${COLORS.stone300}`,
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={status === 'loading' || !email.includes('@')}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            background: COLORS.emerald600,
            color: '#fff',
            border: 'none',
            fontSize: 13,
            fontWeight: 600,
            cursor: status === 'loading' ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            opacity: !email.includes('@') ? 0.6 : 1,
          }}
        >
          {status === 'loading' ? '…' : 'Notify me'}
        </button>
      </form>
      {status === 'error' && (
        <p style={{ fontSize: 12, color: COLORS.hardRed, margin: '6px 0 0 0' }}>{message}</p>
      )}
    </div>
  );
}
