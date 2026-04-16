// app.js — PackPath frontend

// ── State ─────────────────────────────────────────────────────────────
const sections = {
  form:     document.getElementById('form-section'),
  progress: document.getElementById('progress-section'),
  error:    document.getElementById('error-section'),
  results:  document.getElementById('results-section'),
};

// ── Show/hide helpers ─────────────────────────────────────────────────
function showSection(name) {
  Object.entries(sections).forEach(([key, el]) => {
    el.classList.toggle('hidden', key !== name);
  });
}

function resetToForm() {
  showSection('form');
  document.getElementById('submit-btn').disabled = false;
}

// ── Form submission ───────────────────────────────────────────────────
document.getElementById('prefs-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const prefs = collectPreferences();
  if (!prefs) return;
  await runPipeline(prefs);
});

// ── Demo button — load cached output ─────────────────────────────────
document.getElementById('demo-btn').addEventListener('click', async () => {
  showSection('progress');
  setProgress(5, 'Loading demo output…');
  try {
    const res = await fetch('/api/routes/cached');
    if (!res.ok) {
      const data = await res.json();
      showError(data.error || 'No cached output available. Run the pipeline first.');
      return;
    }
    const data = await res.json();
    renderResults(data.routes);
  } catch (err) {
    showError(err.message);
  }
});

// ── Collect form values ───────────────────────────────────────────────
function collectPreferences() {
  const days = parseInt(document.getElementById('days').value);
  const miles = parseFloat(document.getElementById('miles').value);
  const elevation = document.getElementById('elevation').value;
  const crowd = document.getElementById('crowd').value;
  const experience = document.getElementById('experience').value;
  const notes = document.getElementById('notes').value.trim();

  const scenery = [...document.querySelectorAll('input[name="scenery"]:checked')]
    .map(cb => cb.value);

  if (isNaN(days) || days < 2 || days > 10) {
    alert('Trip length must be between 2 and 10 days.');
    return null;
  }
  if (isNaN(miles) || miles < 4 || miles > 20) {
    alert('Miles per day must be between 4 and 20.');
    return null;
  }
  if (scenery.length === 0) {
    alert('Select at least one scenery preference.');
    return null;
  }

  return {
    daysTarget: days,
    milesPerDayTarget: miles,
    elevationTolerance: elevation,
    sceneryPreferences: scenery,
    crowdPreference: crowd,
    experienceLevel: experience,
    groupType: 'couple',
    avoid: '',
    priorities: scenery.join(', '),
    notes: notes || undefined,
  };
}

// ── Run pipeline via SSE ──────────────────────────────────────────────
async function runPipeline(prefs) {
  showSection('progress');
  document.getElementById('submit-btn').disabled = true;

  try {
    const response = await fetch('/api/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: response.statusText }));
      showError(data.error || 'Server error');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          // handled with next data line
        } else if (line.startsWith('data: ')) {
          const eventLine = lines[lines.indexOf(line) - 1] || '';
          const eventType = eventLine.replace('event: ', '').trim();
          const payload = JSON.parse(line.replace('data: ', ''));
          handleSSEEvent(eventType, payload);
        }
      }
    }

    // Parse remaining buffer
    const remaining = buffer.split('\n');
    let lastEvent = '';
    for (const line of remaining) {
      if (line.startsWith('event: ')) {
        lastEvent = line.replace('event: ', '').trim();
      } else if (line.startsWith('data: ')) {
        try {
          const payload = JSON.parse(line.replace('data: ', ''));
          handleSSEEvent(lastEvent, payload);
        } catch {}
      }
    }

  } catch (err) {
    showError(err.message);
  }
}

// ── SSE event handler ─────────────────────────────────────────────────
function handleSSEEvent(type, payload) {
  if (type === 'progress') {
    setProgress(payload.step, payload.message);
  } else if (type === 'result') {
    renderResults(payload.routes);
  } else if (type === 'error') {
    showError(payload.message);
  }
}

// ── Progress UI ───────────────────────────────────────────────────────
function setProgress(step, message) {
  document.getElementById('progress-message').textContent = message;
  document.querySelectorAll('.step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.toggle('done', s < step);
    el.classList.toggle('active', s === step);
  });
}

// ── Error UI ──────────────────────────────────────────────────────────
function showError(message) {
  document.getElementById('error-message').textContent = message;
  showSection('error');
  document.getElementById('submit-btn').disabled = false;
}

// ── Render results ────────────────────────────────────────────────────
function renderResults(routes) {
  const grid = document.getElementById('routes-grid');
  grid.innerHTML = '';

  for (const route of routes) {
    grid.appendChild(buildRouteCard(route));
  }

  showSection('results');
}

function buildRouteCard(route) {
  const card = document.createElement('article');
  card.className = 'route-card';

  const gainK = (route.totalGainFt / 1000).toFixed(1);
  const archClass = `archetype-${route.archetype}`;

  card.innerHTML = `
    <div class="route-card-header">
      <div>
        <div class="route-name">${esc(route.routeName)}</div>
        <span class="route-archetype ${archClass}">${esc(route.archetype)}</span>
      </div>
      <div class="route-stats">
        <div class="stat">
          <span class="stat-value">${route.totalMiles} mi</span>
          <span class="stat-label">Total</span>
        </div>
        <div class="stat">
          <span class="stat-value">${route.days} days</span>
          <span class="stat-label">Duration</span>
        </div>
        <div class="stat">
          <span class="stat-value">+${gainK}k ft</span>
          <span class="stat-label">Gain</span>
        </div>
      </div>
    </div>

    <div class="route-summary">${esc(route.summary)}</div>

    <div class="best-for"><strong>Best for:</strong> ${esc(route.bestFor)}</div>

    <button class="itinerary-toggle" aria-expanded="false">
      Day-by-day itinerary
      <span class="toggle-icon">▼</span>
    </button>
    <div class="itinerary-body">
      ${route.segments.map(seg => buildDayRow(seg)).join('')}
    </div>

    <div class="pros-cons">
      <div class="pros">
        <h4>Pros</h4>
        <ul>${route.pros.map(p => `<li>${esc(p)}</li>`).join('')}</ul>
      </div>
      <div class="cons">
        <h4>Cons</h4>
        <ul>${route.cons.map(c => `<li>${esc(c)}</li>`).join('')}</ul>
      </div>
    </div>

    ${route.gearTips && route.gearTips.length ? `
    <div class="gear-tips">
      <h4>Gear tips</h4>
      <ul>${route.gearTips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
    </div>` : ''}
  `;

  // Toggle itinerary
  const toggle = card.querySelector('.itinerary-toggle');
  const body = card.querySelector('.itinerary-body');
  toggle.addEventListener('click', () => {
    const open = body.classList.toggle('open');
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
  });

  return card;
}

function buildDayRow(seg) {
  const trails = seg.trailNames
    .filter(t => t && t !== '(unnamed)')
    .join(', ');

  const gainStr = seg.gainFt ? `+${seg.gainFt.toLocaleString()} ft` : '';
  const lossStr = seg.lossFt ? `-${seg.lossFt.toLocaleString()} ft` : '';

  return `
    <div class="day-row">
      <div class="day-label">Day ${seg.day}</div>
      <div class="day-content">
        <div class="day-stats">
          <span class="day-stat">${seg.miles} mi</span>
          ${gainStr ? `<span class="day-stat">${gainStr}</span>` : ''}
          ${lossStr ? `<span class="day-stat">${lossStr}</span>` : ''}
        </div>
        ${trails ? `<div class="day-trails">${esc(trails)}</div>` : ''}
        <div class="day-note">${esc(seg.note)}</div>
      </div>
    </div>
  `;
}

// ── Escape HTML ───────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Expose resetToForm globally for inline onclick ────────────────────
window.resetToForm = resetToForm;
