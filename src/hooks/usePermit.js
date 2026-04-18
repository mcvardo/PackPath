// usePermit.js — fetches permit info for a region from the backend
import { useState, useEffect } from 'react';

export function usePermit(regionId, startDate) {
  const [permit, setPermit] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!regionId) {
      setPermit(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const params = startDate ? `?startDate=${encodeURIComponent(startDate)}` : '';
    fetch(`/api/permits/${encodeURIComponent(regionId)}${params}`)
      .then(r => r.json())
      .then(data => {
        if (!cancelled) {
          setPermit(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [regionId, startDate]);

  return { permit, loading };
}
