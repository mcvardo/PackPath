// useChat.js — AI conversation state management
// Manages chat history, collected preferences, and readyToRun state.

import { useState, useCallback } from 'react';

export function useChat() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hey! I'm PackPath. Tell me where you want to go and what kind of trip you're after — I'll find real routes from real trails.",
    },
  ]);
  const [collectedPrefs, setCollectedPrefs] = useState({});
  const [readyToRun, setReadyToRun] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim()) return;

    const userMessage = { role: 'user', content: text };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextMessages,
          collectedPrefs,
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
        content: "Sorry, I hit a snag. Try again or fill in your preferences below.",
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, collectedPrefs]);

  const reset = useCallback(() => {
    setMessages([{
      role: 'assistant',
      content: "Hey! I'm PackPath. Tell me where you want to go and what kind of trip you're after — I'll find real routes from real trails.",
    }]);
    setCollectedPrefs({});
    setReadyToRun(false);
    setError(null);
  }, []);

  return { messages, collectedPrefs, readyToRun, isLoading, error, sendMessage, reset };
}
