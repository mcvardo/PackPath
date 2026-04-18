import { useState, useMemo } from 'react';
import { COLORS, FONT_FAMILY } from './styles/tokens.js';
import { useRoutes } from './hooks/useRoutes.js';
import { useChat } from './hooks/useChat.js';
import { ChatBox } from './components/ChatBox.jsx';
import { RouteCard } from './components/RouteCard.jsx';
import { RouteDetail } from './components/RouteDetail.jsx';
import { PreferenceForm } from './components/PreferenceForm.jsx';

const STEP_LABELS = [
  'Load region',
  'Load clusters',
  'Score routes',
  'Build input',
  'Generate narration',
  'Validate',
];

export default function App() {
  const [selectedRoute, setSelectedRoute] = useState(null);

  const { routes, status, step, message, error, findRoutes, reset } = useRoutes();
  const { messages, collectedPrefs, readyToRun, isLoading: chatLoading, sendMessage } = useChat();

  const handleFindRoutes = async (prefs) => {
    setSelectedRoute(null);
    await findRoutes(prefs);
  };

  const handleChatRunRoutes = () => {
    if (!collectedPrefs || Object.keys(collectedPrefs).length === 0) return;
    const prefs = { ...collectedPrefs };
    // Compute daysTarget from dates if needed
    if (prefs.startDate && prefs.endDate && !prefs.daysTarget) {
      const diff = Math.ceil((new Date(prefs.endDate) - new Date(prefs.startDate)) / (1000 * 60 * 60 * 24));
      if (diff > 0) prefs.daysTarget = diff;
    }
    if (prefs.location) prefs.region = prefs.location;
    handleFindRoutes(prefs);
  };

  const totalFeatures = useMemo(() => {
    if (!routes) return 0;
    const all = new Set();
    routes.forEach(r =>
      r.segments.forEach(s =>
        Object.values(s.features || {}).forEach(arr => arr.forEach(f => all.add(f)))
      )
    );
    return all.size;
  }, [routes]);

  const regionId = collectedPrefs?.location
    ? collectedPrefs.location.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    : null;
  const startDate = collectedPrefs?.startDate || null;
  const regionLabel = collectedPrefs?.location || null;

  return (
    <div style={{
      maxWidth: 640,
      margin: '0 auto',
      padding: '16px 16px 60px',
      fontFamily: FONT_FAMILY,
      color: COLORS.stone800,
      background: COLORS.stone50,
      minHeight: '100vh',
    }}>

      {/* ── Header ── */}
      <div style={{ textAlign: 'center', marginBottom: 24, paddingTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 28 }}>⛰</span>
          <h1 style={{
            fontSize: 26,
            fontWeight: 800,
            margin: 0,
            color: COLORS.stone800,
            letterSpacing: -0.5,
          }}>
            PackPath
          </h1>
        </div>
        <p style={{ fontSize: 14, color: COLORS.stone500, margin: '4px 0 0 0' }}>
          Real trails. AI-planned routes. No made-up miles.
        </p>
        {regionLabel && (
          <p style={{ fontSize: 13, color: COLORS.emerald700, margin: '6px 0 0 0', fontWeight: 600 }}>
            📍 {regionLabel}
          </p>
        )}
        {routes && (
          <p style={{ fontSize: 13, color: COLORS.stone400, margin: '6px 0 0 0' }}>
            {routes.length} routes · {totalFeatures} trail features · AI-planned from real geometry
          </p>
        )}
      </div>

      {/* ── Route Detail overlay ── */}
      {selectedRoute && (
        <div style={{ marginBottom: 24 }}>
          <RouteDetail
            route={selectedRoute}
            onBack={() => setSelectedRoute(null)}
            regionId={regionId}
            startDate={startDate}
          />
        </div>
      )}

      {!selectedRoute && (
        <>
          {/* ── AI Chat ── */}
          <div style={{ marginBottom: 20 }}>
            <p style={{
              fontSize: 12,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              color: COLORS.stone400,
              margin: '0 0 8px 0',
            }}>
              Plan with AI
            </p>
            <ChatBox
              messages={messages}
              onSend={sendMessage}
              isLoading={chatLoading}
              readyToRun={readyToRun}
              onRunRoutes={handleChatRunRoutes}
            />
          </div>

          {/* ── Divider ── */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            margin: '20px 0',
          }}>
            <div style={{ flex: 1, height: 1, background: COLORS.stone200 }} />
            <span style={{ fontSize: 13, color: COLORS.stone400, whiteSpace: 'nowrap' }}>
              or fill it in yourself
            </span>
            <div style={{ flex: 1, height: 1, background: COLORS.stone200 }} />
          </div>

          {/* ── Manual Form ── */}
          <div style={{ marginBottom: 24 }}>
            <PreferenceForm
              onSubmit={handleFindRoutes}
              isLoading={status === 'loading'}
              externalPrefs={collectedPrefs}
            />
          </div>

          {/* ── Loading state ── */}
          {status === 'loading' && (
            <div style={{
              background: '#fff',
              border: `1px solid ${COLORS.stone200}`,
              borderRadius: 12,
              padding: 24,
              textAlign: 'center',
              marginBottom: 16,
            }}>
              <div style={{
                width: 36,
                height: 36,
                border: `3px solid ${COLORS.stone200}`,
                borderTopColor: COLORS.emerald600,
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 16px',
              }} />
              <p style={{ fontSize: 14, color: COLORS.stone600, margin: '0 0 16px 0' }}>
                {message || 'Finding routes…'}
              </p>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                {STEP_LABELS.map((label, i) => (
                  <span key={i} style={{
                    fontSize: 11,
                    padding: '3px 8px',
                    borderRadius: 20,
                    background: i < step ? COLORS.emerald100 : i === step ? COLORS.emerald600 : COLORS.stone100,
                    color: i < step ? COLORS.emerald700 : i === step ? '#fff' : COLORS.stone400,
                  }}>
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Error state ── */}
          {status === 'failed' && error && (
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
            }}>
              <p style={{ fontSize: 14, color: COLORS.hardRed, margin: '0 0 8px 0', fontWeight: 600 }}>
                Something went wrong
              </p>
              <p style={{ fontSize: 13, color: COLORS.stone600, margin: '0 0 12px 0' }}>{error}</p>
              <button onClick={reset} style={{
                fontSize: 13, fontWeight: 600, color: COLORS.emerald600,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit',
              }}>
                Try again
              </button>
            </div>
          )}

          {/* ── Route cards ── */}
          {routes?.map((route, i) => (
            <RouteCard key={i} route={route} onClick={() => setSelectedRoute(route)} regionId={regionId} startDate={startDate} />
          ))}
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
