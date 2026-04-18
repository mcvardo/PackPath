// usePermit.js — fetches permit info for a region from the backend
import { useState, useEffect } from 'react';

export function usePermit(regionId, startDate) {
  const [permit, setPermit] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!regionId) { setPermit(null); return; }
    setLoading(true);
    const params = startDate ? `?startDate=${startDate}` : '';
    fetch(`/api/permits/${regionId}${params}`)
      .then(r => r.json())
      .then(data => { setPermit(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [regionId, startDate]);

  return { permit, loading };
}
