import { useState, useRef, useEffect } from 'react';
import { COLORS, FONT_FAMILY } from '../styles/tokens.js';

/**
 * AI chat interface for collecting trip preferences conversationally.
 */
export function ChatBox({ messages, onSend, isLoading, readyToRun, onRunRoutes }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    onSend(text);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Chat history */}
      <div style={{
        background: '#fff',
        border: `1px solid ${COLORS.stone200}`,
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 8,
        maxHeight: 320,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}>
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{
              maxWidth: '82%',
              padding: '8px 12px',
              borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              background: msg.role === 'user' ? COLORS.emerald600 : COLORS.stone100,
              color: msg.role === 'user' ? '#fff' : COLORS.stone800,
              fontSize: 14,
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '8px 14px',
              borderRadius: '12px 12px 12px 2px',
              background: COLORS.stone100,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
            }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: COLORS.stone400,
                  display: 'inline-block',
                  animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                }} />
              ))}
            </div>
          </div>
        )}

        {/* Ready to run button */}
        {readyToRun && !isLoading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 4 }}>
            <button
              onClick={onRunRoutes}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                background: COLORS.emerald600,
                color: '#fff',
                border: 'none',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ⛰ Find My Routes →
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Where are you headed? Tell me about your trip..."
          disabled={isLoading}
          style={{
            flex: 1,
            padding: '10px 14px',
            borderRadius: 10,
            border: `1px solid ${COLORS.stone300}`,
            fontSize: 14,
            fontFamily: 'inherit',
            color: COLORS.stone800,
            background: '#fff',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          style={{
            padding: '10px 16px',
            borderRadius: 10,
            background: input.trim() && !isLoading ? COLORS.emerald600 : COLORS.stone200,
            color: input.trim() && !isLoading ? '#fff' : COLORS.stone400,
            border: 'none',
            fontSize: 14,
            fontWeight: 700,
            cursor: input.trim() && !isLoading ? 'pointer' : 'default',
            fontFamily: 'inherit',
            transition: 'all 0.15s',
          }}
        >
          Send
        </button>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
