// useSavedTrips.js — localStorage-based trip saving
import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'packpath_saved_trips';

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(trips) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
  } catch {
    // storage full or unavailable — fail silently
  }
}

export function useSavedTrips() {
  const [savedTrips, setSavedTrips] = useState(loadFromStorage);

  // Persist on every change
  useEffect(() => {
    saveToStorage(savedTrips);
  }, [savedTrips]);

  const saveTrip = useCallback((route, regionId, startDate, endDate) => {
    const trip = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      savedAt: new Date().toISOString(),
      routeName: route.routeName,
      archetype: route.archetype,
      totalMiles: route.totalMiles,
      totalGainFt: route.totalGainFt,
      days: route.days,
      regionId,
      startDate: startDate || null,
      endDate: endDate || null,
      geoCenter: route.geoCenter || null,
      bestFor: route.bestFor,
      // Store the full route for detail view — trimmed to essentials only
      route: {
        routeName: route.routeName,
        archetype: route.archetype,
        totalMiles: route.totalMiles,
        totalGainFt: route.totalGainFt,
        totalLossFt: route.totalLossFt,
        days: route.days,
        geoCenter: route.geoCenter,
        summary: route.summary,
        bestFor: route.bestFor,
        pros: route.pros,
        cons: route.cons,
        gearTips: route.gearTips,
        segments: route.segments,
        // Omit weather — stale after a day anyway
      },
    };
    setSavedTrips(prev => [trip, ...prev]);
    return trip.id;
  }, []);

  const removeTrip = useCallback((id) => {
    setSavedTrips(prev => prev.filter(t => t.id !== id));
  }, []);

  const isSaved = useCallback((routeName) => {
    return savedTrips.some(t => t.routeName === routeName);
  }, [savedTrips]);

  return { savedTrips, saveTrip, removeTrip, isSaved };
}
