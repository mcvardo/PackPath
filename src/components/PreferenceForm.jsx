import { useState, useEffect, useRef, useMemo } from 'react';
import { COLORS, REGIONS } from '../styles/tokens.js';

// ─── Option Arrays ───────────────────────────────────
const SCENERY = [
  { value: 'lakes', label: 'Lakes', icon: '💧' },
  { value: 'peaks', label: 'Peaks', icon: '🏔️' },
  { value: 'passes', label: 'Passes', icon: '🛤️' },
  { value: 'meadows', label: 'Meadows', icon: '🌻' },
  { value: 'forest', label: 'Forest', icon: '🌲' },
  { value: 'streams', label: 'Streams', icon: '🏞️' },
  { value: 'ridgeline', label: 'Ridgeline', icon: '⟰️' },
];

const AVOID_OPTIONS = [
  { value: 'exposed ridgeline', label: 'Exposed Ridge', icon: '⚡' },
  { value: 'long waterless stretches', label: 'No Water', icon: '🏜️' },
  { value: 'steep scrambles', label: 'Scrambles', icon: '🪨' },
  { value: 'river crossings', label: 'River Crossings', icon: '🌊' },
  { value: 'crowded trails', label: 'Crowds', icon: '👥' },
  { value: 'snow travel', label: 'Snow / Ice', icon: '❄️' },
  { value: 'mosquito-heavy areas', label: 'Mosquitoes', icon: '🪳' },
  { value: 'high altitude', label: 'High Altitude', icon: '💫' },
];

const PRIORITY_OPTIONS = [
  { value: 'alpine lakes', label: 'Alpine Lakes', icon: '💧' },
  { value: 'named peaks', label: 'Named Peaks', icon: '🏔️' },
  { value: 'terrain variety', label: 'Terrain Variety', icon: '🧭' },
  { value: 'wildlife viewing', label: 'Wildlife', icon: '🦌' },
  { value: 'reliable water', label: 'Reliable Water', icon: '🚰' },
  { value: 'good campsites', label: 'Good Camps', icon: '⛺️' },
  { value: 'sunset viewpoints', label: 'Sunset Views', icon: '🌅' },
  { value: 'solitude', label: 'Solitude', icon: '🍃' },
  { value: 'wildflower meadows', label: 'Wildflowers', icon: '🌸' },
];

// ─── Shared Styles ───────────────────────────────────
const inputBase = {
  width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 15,
  border: `1.5px solid ${COLORS.stone200}`, background: '#fff', color: COLORS.stone800,
  outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  transition: 'border-color 0.15s',
};

const labelStyle = {
  display: 'block', fontSize: 13, fontWeight: 600,
  color: COLORS.stone600, marginBottom: 6,
};

// ─── Section wrapper ─────────────────────────────────
function Section({ title, subtitle, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: COLORS.stone800, margin: '0 0 2px 0', lineHeight: 1.3 }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ fontSize: 13, color: COLORS.stone400, margin: '0 0 16px 0' }}>{subtitle}</p>
      )}
      {!subtitle && <div style={{ height: 12 }} />}
      {children}
    </div>
  );
}

// ─── PillToggle ──────────────────────────────────────
function PillToggle({ options, value, onChange, columns }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: columns ? `repeat(${columns}, 1fr)` : `repeat(${options.length}, 1fr)`,
      gap: 8,
    }}>
      {options.map((opt) => {
        const val = typeof opt === 'string' ? opt : opt.value;
        const lbl = typeof opt === 'string' ? opt : opt.label;
        const desc = typeof opt === 'object' ? opt.desc : null;
        const active = value === val;
        return (
          <button key={val} onClick={() => onChange(val)} style={{
            padding: desc ? '10px 8px' : '12px 0',
            borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.15s', textTransform: 'capitalize', textAlign: 'center',
            background: active ? COLORS.emerald600 : '#fff',
            color: active ? '#fff' : COLORS.stone600,
            border: `1.5px solid ${active ? COLORS.emerald600 : COLORS.stone200}`,
            boxShadow: active ? '0 2px 8px rgba(5,150,105,0.25)' : 'none',
            minHeight: 44, fontFamily: 'inherit',
          }}>
            <div>{lbl}</div>
            {desc && (
              <div style={{
                fontSize: 11, fontWeight: 400, marginTop: 3,
                color: active ? COLORS.emerald100 : COLORS.stone400,
              }}>{desc}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── ChipSelect ──────────────────────────────────────
function ChipSelect({ options, selected, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button key={opt.value} onClick={() => onToggle(opt.value)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 20, fontSize: 14, fontWeight: 500,
            cursor: 'pointer', transition: 'all 0.15s',
            background: active ? COLORS.emerald600 : '#fff',
            color: active ? '#fff' : COLORS.stone600,
            border: `1.5px solid ${active ? COLORS.emerald600 : COLORS.stone200}`,
            boxShadow: active ? '0 2px 8px rgba(5,150,105,0.2)' : 'none',
            minHeight: 44, fontFamily: 'inherit',
          }}>
            <span style={{ fontSize: 16 }}>{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Region Search Combobox ──────────────────────────
function RegionSearch({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return REGIONS;
    const q = query.toLowerCase();
    return REGIONS.filter(
      (r) => r.name.toLowerCase().includes(q) || r.state.toLowerCase().includes(q) || r.id.includes(q)
    );
  }, [query]);

  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (open && listRef.current && highlightIdx >= 0) {
      const items = listRef.current.children;
      if (items[highlightIdx]) items[highlightIdx].scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx, open]);

  const selectedRegion = REGIONS.find((r) => r.id === value);

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); setHighlightIdx(0); e.preventDefault(); }
      return;
    }
    if (e.key === 'ArrowDown') { setHighlightIdx((p) => Math.min(p + 1, filtered.length - 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { setHighlightIdx((p) => Math.max(p - 1, 0)); e.preventDefault(); }
    else if (e.key === 'Enter' && highlightIdx >= 0 && filtered[highlightIdx]) {
      onChange(filtered[highlightIdx].id); setQuery(''); setOpen(false); inputRef.current?.blur(); e.preventDefault();
    } else if (e.key === 'Escape') { setOpen(false); setQuery(''); e.preventDefault(); }
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1.5px solid ${open ? COLORS.emerald400 : COLORS.stone200}`,
        borderRadius: 10, background: '#fff', overflow: 'hidden',
        transition: 'border-color 0.15s',
        boxShadow: open ? '0 0 0 3px rgba(52,211,153,0.15)' : 'none',
      }}>
        <span style={{ padding: '0 0 0 14px', fontSize: 18, color: COLORS.stone400, flexShrink: 0 }}>🗺</span>
        <input
          ref={inputRef} type="text"
          value={open ? query : (selectedRegion ? selectedRegion.name : query)}
          onChange={(e) => { setQuery(e.target.value); setHighlightIdx(0); if (!open) setOpen(true); }}
          onFocus={() => { setOpen(true); setHighlightIdx(-1); if (selectedRegion) setQuery(''); }}
          onKeyDown={handleKeyDown}
          placeholder="Search wilderness areas, national parks..."
          style={{
            flex: 1, padding: '12px 10px', border: 'none', outline: 'none',
            fontSize: 15, color: COLORS.stone800, background: 'transparent', fontFamily: 'inherit',
          }}
          aria-label="Search regions" aria-expanded={open} aria-autocomplete="list" role="combobox"
        />
        {selectedRegion && !open && (
          <button onClick={(e) => { e.stopPropagation(); onChange(''); setQuery(''); inputRef.current?.focus(); }}
            aria-label="Clear selection" style={{
              width: 36, height: 36, border: 'none', background: 'transparent',
              cursor: 'pointer', fontSize: 16, color: COLORS.stone400, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
        )}
        <span style={{
          padding: '0 12px 0 0', fontSize: 12, color: COLORS.stone400, flexShrink: 0,
          transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
        }}>▼</span>
      </div>

      {selectedRegion && !open && (
        <div style={{
          marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px', borderRadius: 8,
          background: COLORS.emerald50, border: `1px solid ${COLORS.emerald200}`,
        }}>
          <span style={{ fontSize: 12, color: COLORS.emerald700, fontWeight: 600 }}>{selectedRegion.name}</span>
          <span style={{ fontSize: 11, color: COLORS.emerald600 }}>· {selectedRegion.state}</span>
        </div>
      )}

      {open && (
        <div ref={listRef} role="listbox" style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: 4, maxHeight: 260, overflowY: 'auto',
          background: '#fff', border: `1.5px solid ${COLORS.stone200}`,
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50,
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '16px 14px', textAlign: 'center', color: COLORS.stone400, fontSize: 14 }}>
              No matching regions found
            </div>
          ) : filtered.map((region, i) => {
            const isHighlighted = i === highlightIdx;
            const isSelected = region.id === value;
            return (
              <div key={region.id} role="option" aria-selected={isSelected}
                onClick={() => { onChange(region.id); setQuery(''); setOpen(false); }}
                onMouseEnter={() => setHighlightIdx(i)}
                style={{
                  padding: '10px 14px', cursor: 'pointer',
                  background: isHighlighted ? COLORS.emerald50 : (isSelected ? COLORS.stone50 : '#fff'),
                  borderBottom: i < filtered.length - 1 ? `1px solid ${COLORS.stone100}` : 'none',
                }}>
                <div style={{
                  fontSize: 14, fontWeight: isSelected ? 700 : 500,
                  color: isSelected ? COLORS.emerald700 : COLORS.stone800,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {isSelected && <span style={{ color: COLORS.emerald500 }}>✓</span>}
                  {region.name}
                </div>
                <div style={{ fontSize: 12, color: COLORS.stone400, marginTop: 2 }}>{region.state}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Date Range Calendar ─────────────────────────────
function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [, m, d] = dateStr.split('-').map(Number);
  return `${months[m - 1]} ${d}`;
}

function DateRangeCalendar({ startDate, endDate, onStartChange, onEndChange }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = toDateStr(today);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [hovered, setHovered] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [selecting, setSelecting] = useState(startDate ? 'end' : 'start');

  const daysBetween = useMemo(() => {
    if (!startDate || !endDate) return null;
    const diff = Math.round((parseDate(endDate) - parseDate(startDate)) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : null;
  }, [startDate, endDate]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startDow = firstDay.getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d));
    return cells;
  }, [viewYear, viewMonth]);

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); } else setViewMonth(viewMonth - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); } else setViewMonth(viewMonth + 1);
  }

  function handleDayClick(date) {
    const str = toDateStr(date);
    if (date < today) return;
    if (selecting === 'start') {
      onStartChange(str); onEndChange(''); setSelecting('end');
    } else {
      if (startDate && str <= startDate) { onStartChange(str); onEndChange(''); setSelecting('end'); }
      else { onEndChange(str); setSelecting('start'); setTimeout(() => setExpanded(false), 350); }
    }
  }

  function clearDates() { onStartChange(''); onEndChange(''); setSelecting('start'); }

  function getDayStyle(date) {
    if (!date) return {};
    const str = toDateStr(date);
    const isPast = date < today;
    const isStart = str === startDate;
    const isEnd = str === endDate;
    const isToday = str === todayStr;
    const sDate = parseDate(startDate), eDate = parseDate(endDate), hovDate = parseDate(hovered);
    let inRange = false, inPreview = false;
    if (sDate && eDate && date > sDate && date < eDate) inRange = true;
    if (sDate && !eDate && hovDate && selecting === 'end' && date > sDate && date <= hovDate) inPreview = true;
    const isEndpoint = isStart || isEnd;
    let bg = 'transparent', color = isPast ? COLORS.stone300 : COLORS.stone700, fontWeight = 400, borderRadius = '50%', border = 'none';
    if (isEndpoint) { bg = COLORS.emerald600; color = '#fff'; fontWeight = 700; }
    else if (inRange) { bg = COLORS.emerald100; color = COLORS.emerald800; borderRadius = 0; }
    else if (inPreview) { bg = COLORS.emerald50; color = COLORS.emerald700; borderRadius = 0; }
    if (isToday && !isEndpoint) border = `2px solid ${COLORS.emerald400}`;
    if (isStart && (inRange || (eDate && isEnd))) borderRadius = '50% 0 0 50%';
    if (isEnd && inRange) borderRadius = '0 50% 50% 0';
    if (isStart && isEnd) borderRadius = '50%';
    return { bg, color, fontWeight, borderRadius, border, isPast };
  }

  return (
    <div>
      <button onClick={() => setExpanded(!expanded)} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px', borderRadius: 10,
        background: '#fff', border: `1.5px solid ${expanded ? COLORS.emerald400 : COLORS.stone200}`,
        cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
        boxShadow: expanded ? '0 0 0 3px rgba(52,211,153,0.15)' : 'none',
      }}>
        <span style={{ fontSize: 18, color: COLORS.stone400, flexShrink: 0 }}>📅</span>
        <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          {startDate && endDate ? (
            <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.stone800 }}>
              {formatDisplayDate(startDate)} → {formatDisplayDate(endDate)}
              <span style={{ fontWeight: 400, color: COLORS.stone500, marginLeft: 6 }}>
                ({daysBetween} {daysBetween === 1 ? 'day' : 'days'})
              </span>
            </span>
          ) : startDate ? (
            <span style={{ fontSize: 15, color: COLORS.emerald700, fontWeight: 600 }}>
              {formatDisplayDate(startDate)} → <span style={{ fontWeight: 400, color: COLORS.stone400 }}>select end date</span>
            </span>
          ) : (
            <span style={{ fontSize: 15, color: COLORS.stone400 }}>Select your dates</span>
          )}
        </div>
        <span style={{
          fontSize: 12, color: COLORS.stone400, flexShrink: 0,
          transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s',
        }}>▼</span>
      </button>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          <div style={{ background: '#fff', border: `1.5px solid ${COLORS.stone200}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${COLORS.stone100}` }}>
              <button onClick={prevMonth} style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${COLORS.stone200}`, background: '#fff', cursor: 'pointer', fontSize: 16, color: COLORS.stone600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
              <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.stone800 }}>{monthNames[viewMonth]} {viewYear}</div>
              <button onClick={nextMonth} style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${COLORS.stone200}`, background: '#fff', cursor: 'pointer', fontSize: 16, color: COLORS.stone600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '8px 10px 4px' }}>
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d) => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: COLORS.stone400, textTransform: 'uppercase', letterSpacing: 0.5, padding: '4px 0' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '0 10px 10px', gap: '2px 0' }}>
              {calendarDays.map((date, i) => {
                if (!date) return <div key={`blank-${i}`} />;
                const s = getDayStyle(date);
                const str = toDateStr(date);
                return (
                  <div key={str} onClick={() => !s.isPast && handleDayClick(date)}
                    onMouseEnter={() => !s.isPast && setHovered(str)} onMouseLeave={() => setHovered(null)}
                    style={{
                      textAlign: 'center', padding: '8px 0', fontSize: 14, fontWeight: s.fontWeight,
                      color: s.color, background: s.bg, borderRadius: s.borderRadius, border: s.border,
                      cursor: s.isPast ? 'default' : 'pointer', transition: 'background 0.1s', userSelect: 'none', boxSizing: 'border-box',
                    }}>
                    {date.getDate()}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{
            marginTop: 8, display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 8,
            background: (startDate || endDate) ? COLORS.emerald50 : COLORS.stone50,
            border: `1px solid ${(startDate || endDate) ? COLORS.emerald200 : COLORS.stone200}`,
            minHeight: 40,
          }}>
            {!startDate && !endDate && <span style={{ fontSize: 13, color: COLORS.stone400 }}>Tap your start date</span>}
            {startDate && !endDate && (
              <span style={{ fontSize: 13, color: COLORS.emerald700 }}>
                <strong>{formatDisplayDate(startDate)}</strong> → tap your end date
              </span>
            )}
            {startDate && endDate && daysBetween && (
              <>
                <span style={{ fontSize: 13, color: COLORS.emerald700 }}>
                  <strong>{formatDisplayDate(startDate)}</strong> → <strong>{formatDisplayDate(endDate)}</strong>
                </span>
                <span style={{
                  marginLeft: 'auto', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                  background: daysBetween >= 7 ? COLORS.amber100 : daysBetween <= 2 ? COLORS.emerald100 : COLORS.stone100,
                  color: daysBetween >= 7 ? '#92400e' : daysBetween <= 2 ? COLORS.emerald800 : COLORS.stone600,
                }}>
                  {daysBetween} {daysBetween === 1 ? 'day' : 'days'}
                </span>
              </>
            )}
            {(startDate || endDate) && (
              <button onClick={clearDates} style={{
                marginLeft: startDate && endDate ? 0 : 'auto',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 13, color: COLORS.stone400, padding: '2px 4px', fontFamily: 'inherit',
              }}>Clear</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Form ───────────────────────────────────────
function daysBetweenDates(start, end) {
  if (!start || !end) return null;
  const diff = Math.ceil((new Date(end) - new Date(start)) / (1000 * 60 * 60 * 24));
  return diff > 0 ? diff : null;
}

export function PreferenceForm({ onSubmit, isLoading, externalPrefs = {} }) {
  const [form, setForm] = useState({
    region: '',
    startDate: '',
    endDate: '',
    daysTarget: 0,
    totalMiles: 40,
    elevationTolerance: 'moderate',
    sceneryPreferences: [],
    crowdPreference: 'mixed',
    experienceLevel: 'intermediate',
    groupType: 'couple',
    avoid: [],
    priorities: [],
    notes: '',
  });

  // Sync external prefs from chat
  useEffect(() => {
    if (!externalPrefs || Object.keys(externalPrefs).length === 0) return;
    setForm(prev => {
      const next = { ...prev };
      if (externalPrefs.location) {
        // Try to match location text to a region ID
        const match = REGIONS.find(r =>
          r.name.toLowerCase() === externalPrefs.location.toLowerCase() ||
          r.id === externalPrefs.location.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        );
        if (match) next.region = match.id;
      }
      if (externalPrefs.region) next.region = externalPrefs.region;
      if (externalPrefs.startDate) next.startDate = externalPrefs.startDate;
      if (externalPrefs.endDate) next.endDate = externalPrefs.endDate;
      if (externalPrefs.elevationTolerance) next.elevationTolerance = externalPrefs.elevationTolerance;
      if (Array.isArray(externalPrefs.sceneryPreferences) && externalPrefs.sceneryPreferences.length > 0) {
        next.sceneryPreferences = externalPrefs.sceneryPreferences;
      }
      if (externalPrefs.crowdPreference) next.crowdPreference = externalPrefs.crowdPreference;
      if (externalPrefs.experienceLevel) next.experienceLevel = externalPrefs.experienceLevel;
      if (externalPrefs.groupType) next.groupType = externalPrefs.groupType;
      if (externalPrefs.notes) next.notes = externalPrefs.notes;
      return next;
    });
  }, [externalPrefs]);

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const toggleChip = (key) => (val) => {
    update(key, form[key].includes(val)
      ? form[key].filter((x) => x !== val)
      : [...form[key], val]
    );
  };
  const toggleScenery = toggleChip('sceneryPreferences');
  const toggleAvoid = toggleChip('avoid');
  const togglePriority = toggleChip('priorities');

  // Auto-sync daysTarget from dates
  const days = daysBetweenDates(form.startDate, form.endDate);
  useEffect(() => {
    if (days && days !== form.daysTarget) update('daysTarget', days);
  }, [days]);

  // Implied pace
  const impliedPace = form.totalMiles && (days || form.daysTarget) > 0
    ? (form.totalMiles / (days || form.daysTarget)).toFixed(1)
    : null;

  const canSubmit = form.region && form.startDate && form.endDate && !isLoading;

  const handleSubmit = () => {
    if (!onSubmit) return;
    const d = days || form.daysTarget || 4;
    const milesPerDayTarget = Math.round((form.totalMiles / d) * 10) / 10;
    const prefs = {
      region: form.region,
      location: REGIONS.find(r => r.id === form.region)?.name || form.region,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      daysTarget: d,
      milesPerDayTarget,
      elevationTolerance: form.elevationTolerance === 'low' ? 'easy' : form.elevationTolerance === 'high' ? 'hard' : form.elevationTolerance,
      sceneryPreferences: form.sceneryPreferences.length > 0 ? form.sceneryPreferences : undefined,
      crowdPreference: form.crowdPreference,
      experienceLevel: form.experienceLevel,
      groupType: form.groupType,
      avoid: form.avoid.length > 0 ? form.avoid.join(', ') : undefined,
      priorities: form.priorities.length > 0 ? form.priorities.join(', ') : undefined,
      notes: form.notes || undefined,
    };
    onSubmit(prefs);
  };

  return (
    <div>
      {/* ═══ Where ═══ */}
      <Section title="Where do you want to explore?" subtitle="Search by wilderness area, national park, or state.">
        <RegionSearch value={form.region} onChange={(v) => update('region', v)} />
      </Section>

      {/* ═══ When ═══ */}
      <Section title="When are you going?" subtitle="Helps check permit availability and trail conditions.">
        <DateRangeCalendar
          startDate={form.startDate} endDate={form.endDate}
          onStartChange={(v) => update('startDate', v)} onEndChange={(v) => update('endDate', v)}
        />
      </Section>

      {/* ═══ Trip Parameters ═══ */}
      <Section title="Trip parameters" subtitle="Distance and difficulty.">
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Total miles</label>
          <input
            type="number" value={form.totalMiles}
            onChange={(e) => update('totalMiles', e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
            placeholder="e.g., 40" min={0} style={{ ...inputBase, height: 48 }}
          />
        </div>

        {impliedPace && (days || form.daysTarget) > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 10, marginBottom: 20,
            background: COLORS.emerald50, border: `1px solid ${COLORS.emerald200}`,
          }}>
            <span style={{ fontSize: 13, color: COLORS.emerald700 }}>
              {days || form.daysTarget} {(days || form.daysTarget) === 1 ? 'day' : 'days'} · <strong>{impliedPace} mi/day</strong>
            </span>
            {Number(impliedPace) > 15 && (
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: COLORS.amber100, color: '#92400e' }}>Ambitious</span>
            )}
            {Number(impliedPace) >= 8 && Number(impliedPace) <= 15 && (
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: COLORS.stone100, color: COLORS.stone600 }}>Moderate pace</span>
            )}
            {Number(impliedPace) < 8 && (
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: COLORS.emerald100, color: COLORS.emerald800 }}>Easy pace</span>
            )}
          </div>
        )}

        <div>
          <label style={labelStyle}>Elevation tolerance</label>
          <PillToggle
            options={[
              { value: 'low', label: 'Low', desc: '< 2,000 ft/day' },
              { value: 'moderate', label: 'Moderate', desc: '2–4,000 ft/day' },
              { value: 'high', label: 'High', desc: '4,000+ ft/day' },
            ]}
            value={form.elevationTolerance} onChange={(v) => update('elevationTolerance', v)}
          />
        </div>
      </Section>

      {/* ═══ Scenery & Crowds ═══ */}
      <Section title="Scenery & crowds" subtitle="What you want to see and who you want to see it with.">
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Scenery preferences</label>
          <ChipSelect options={SCENERY} selected={form.sceneryPreferences} onToggle={toggleScenery} />
        </div>
        <div>
          <label style={labelStyle}>Crowd preference</label>
          <PillToggle
            options={[
              { value: 'solitude', label: 'Solitude', desc: 'Minimal encounters' },
              { value: 'mixed', label: 'Mixed', desc: 'Some popular trails OK' },
              { value: 'popular is fine', label: 'Popular', desc: "Don't mind crowds" },
            ]}
            value={form.crowdPreference} onChange={(v) => update('crowdPreference', v)}
          />
        </div>
      </Section>

      {/* ═══ Your Group ═══ */}
      <Section title="Your group" subtitle="Helps calibrate difficulty and logistics.">
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Experience level</label>
          <PillToggle
            options={[
              { value: 'beginner', label: 'Beginner', desc: 'First backpacking trips' },
              { value: 'intermediate', label: 'Intermediate', desc: 'Comfortable overnight' },
              { value: 'advanced', label: 'Advanced', desc: 'Off-trail, high miles' },
            ]}
            value={form.experienceLevel} onChange={(v) => update('experienceLevel', v)}
          />
        </div>
        <div>
          <label style={labelStyle}>Group type</label>
          <PillToggle
            options={[
              { value: 'solo', label: 'Solo' },
              { value: 'couple', label: 'Couple' },
              { value: 'small group', label: 'Small Group' },
              { value: 'large group', label: 'Large Group' },
            ]}
            value={form.groupType} onChange={(v) => update('groupType', v)} columns={2}
          />
        </div>
      </Section>

      {/* ═══ Avoid ═══ */}
      <Section title="Anything you want to avoid?" subtitle="Select all that apply — we'll route around it.">
        <ChipSelect options={AVOID_OPTIONS} selected={form.avoid} onToggle={toggleAvoid} />
      </Section>

      {/* ═══ Priorities ═══ */}
      <Section title="What matters most?" subtitle="Pick your top priorities — we'll optimize for them.">
        <ChipSelect options={PRIORITY_OPTIONS} selected={form.priorities} onToggle={togglePriority} />
      </Section>

      {/* ═══ Notes ═══ */}
      <Section title="Anything else?" subtitle="Optional — free-form notes for the algorithm.">
        <textarea
          value={form.notes} onChange={(e) => update('notes', e.target.value)}
          placeholder="e.g., willing to drive from Bishop, want to bag at least one peak, no permits if possible"
          rows={3} style={{ ...inputBase, resize: 'vertical', minHeight: 56 }}
        />
      </Section>

      {/* ═══ CTA ═══ */}
      <button onClick={handleSubmit} disabled={!canSubmit} style={{
        width: '100%', padding: '16px 0', borderRadius: 14,
        fontSize: 16, fontWeight: 700,
        cursor: canSubmit ? 'pointer' : 'not-allowed',
        background: canSubmit ? `linear-gradient(135deg, ${COLORS.emerald600}, ${COLORS.emerald700})` : COLORS.stone300,
        border: 'none', color: '#fff', fontFamily: 'inherit',
        boxShadow: canSubmit ? '0 4px 16px rgba(5,150,105,0.35)' : 'none',
        minHeight: 52, opacity: canSubmit ? 1 : 0.6,
        pointerEvents: canSubmit ? 'auto' : 'none',
        transition: 'all 0.2s',
      }}>
        {isLoading ? 'Finding routes…' : '⛰ Find Routes'}
      </button>
    </div>
  );
}
