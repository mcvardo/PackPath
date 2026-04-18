// useChat.js — AI conversation state management
import { useState, useCallback, useRef } from 'react';

const INITIAL_MESSAGE = {
  role: 'assistant',
  content: "Hey! I'm PackPath. Tell me where you want to go and what kind of trip you're after — I'll find real routes from real trails.",
};

export function useChat() {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [collectedPrefs, setCollectedPrefs] = useState({});
  const [readyToRun, setReadyToRun] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Use refs to avoid stale closures in sendMessage without re-creating the callback
  const messagesRef = useRef(messages);
  const collectedPrefsRef = useRef(collectedPrefs);
  messagesRef.current = messages;
  collectedPrefsRef.current = collectedPrefs;

  const sendMessage = useCallback(async (text) => {
    if (!text.trim()) return;

    const userMessage = { role: 'user', content: text };
    const nextMessages = [...messagesRef.current, userMessage];
    setMessages(nextMessages);
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          collectedPrefs: collectedPrefsRef.current,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Chat request failed');
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      setCollectedPrefs(data.collectedPrefs || {});
      setReadyToRun(data.readyToRun || false);
    } catch (err) {
      setError(err.message);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Something went wrong: ${err.message}. Try again or fill in your preferences below.`,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, []); // stable — uses refs internally

  const reset = useCallback(() => {
    setMessages([INITIAL_MESSAGE]);
    setCollectedPrefs({});
    setReadyToRun(false);
    setError(null);
  }, []);

  return { messages, collectedPrefs, readyToRun, isLoading, error, sendMessage, reset };
}
