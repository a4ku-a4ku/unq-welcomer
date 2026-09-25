const cursorGlow = document.querySelector('.cursor-glow');
if (cursorGlow) {
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let currentX = mouseX;
  let currentY = mouseY;

  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    cursorGlow.style.opacity = '1';
  });

  document.addEventListener('mouseleave', () => {
    cursorGlow.style.opacity = '0';
  });

  function renderCursor() {
    currentX += (mouseX - currentX) * 0.15;
    currentY += (mouseY - currentY) * 0.15;
    cursorGlow.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate3d(-50%, -50%, 0)`;
    requestAnimationFrame(renderCursor);
  }
  renderCursor();
}

const defaultConfig = {
  name: 'My Welcome Setup',
  minDelay: 2,
  maxDelay: 5,
  tokens: [],
  routes: [{ id: 'r1', name: 'Main Server', serverId: '', channelId: '' }],
  messages: ['Welcome {tag} to the server!']
};

let config = JSON.parse(JSON.stringify(defaultConfig));
let savedConfig = JSON.parse(JSON.stringify(defaultConfig));
let botRunning = false;
let logPollTimer = null;
let statusPollTimer = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const currentSlotId = (() => {
  try {
    const p = new URLSearchParams(window.location.search).get('slot');
    const n = Number(p);
    return n >= 1 && n <= 12 ? n : 1;
  } catch { return 1; }
})();

function apiFetch(endpoint, options = {}) {
  const url = new URL(endpoint, window.location.origin);
  if (!url.searchParams.has('slot')) {
    url.searchParams.set('slot', currentSlotId);
  }
  options.headers = options.headers || {};
  options.headers['X-Slot-Id'] = String(currentSlotId);
  options.credentials = 'same-origin';
  const savedToken = localStorage.getItem('unq_slot_session');
  if (savedToken) {
    options.headers['X-Slot-Token'] = savedToken;
  }
  return fetch(url.toString(), options);
}

function formatSeconds(value) { return `${Number(value).toFixed(1)}s`; }
function pad2(n) { return String(n).padStart(2, '0'); }
function escapeHtml(value) { return String(value || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]); }
function uid() { return 'id_' + Math.random().toString(36).slice(2, 10); }

function updateCounts() {
  const tokenCount = (config.tokens || []).length;
  const routeCount = (config.routes || []).filter(r => r.serverId && r.channelId).length;
  const msgCount = (config.messages || []).filter(m => String(m).trim().length > 0).length;
  
  if ($('#tokens-badge')) $('#tokens-badge').textContent = tokenCount;
  if ($('#routes-badge')) $('#routes-badge').textContent = routeCount;
  if ($('#messages-badge')) $('#messages-badge').textContent = msgCount;
  if ($('#token-count')) $('#token-count').textContent = `${tokenCount} TOKEN${tokenCount === 1 ? '' : 'S'}`;
  if ($('#route-count')) $('#route-count').textContent = `${routeCount} ROUTE${routeCount === 1 ? '' : 'S'}`;
  if ($('#message-count')) $('#message-count').textContent = `${msgCount} MSG${msgCount === 1 ? '' : 'S'}`;
  if ($('#telemetry-tokens')) $('#telemetry-tokens').textContent = tokenCount;
  if ($('#telemetry-routes')) $('#telemetry-routes').textContent = routeCount;
  if ($('#telemetry-messages')) $('#telemetry-messages').textContent = msgCount;
}

let tokenVisible = false;
let currentProfile = null;
let tokenLookupTimer = null;

function updatePreview() {
  const minInput = $('#min-delay');
  const maxInput = $('#max-delay');
  if (!minInput || !maxInput) return;

  let min = Math.max(1, Number(minInput.value) || 1);
  let max = Math.max(1, Number(maxInput.value) || 1);

  if (min > max) {
    max = min;
    maxInput.value = max;
  }

  if ($('#min-delay-value')) $('#min-delay-value').textContent = formatSeconds(min);
  if ($('#max-delay-value')) $('#max-delay-value').textContent = formatSeconds(max);
  if ($('#telemetry-delay')) $('#telemetry-delay').textContent = `${min.toFixed(0)}–${max.toFixed(0)}s`;

  config.minDelay = min;
  config.maxDelay = max;
}

function onMaxDelayInput() {
  const minInput = $('#min-delay');
  const maxInput = $('#max-delay');
  if (!minInput || !maxInput) return;

  let min = Math.max(1, Number(minInput.value) || 1);
  let max = Math.max(1, Number(maxInput.value) || 1);

  if (max < min) {
    min = max;
    minInput.value = min;
  }

  if ($('#min-delay-value')) $('#min-delay-value').textContent = formatSeconds(min);
  if ($('#max-delay-value')) $('#max-delay-value').textContent = formatSeconds(max);
  if ($('#telemetry-delay')) $('#telemetry-delay').textContent = `${min.toFixed(0)}–${max.toFixed(0)}s`;

  config.minDelay = min;
  config.maxDelay = max;
}

function renderDiscordProfile(profile) {
  currentProfile = profile;
  const banner = $('#profile-banner');
  const avatarImg = $('#profile-avatar-img');
  const statusDot = $('#avatar-status-dot');
  const globalName = $('#profile-global-name');
  const handle = $('#profile-handle');
  const snowflake = $('#profile-snowflake');
  const createdText = $('#profile-created-text');
  const nitroBadge = $('#badge-nitro');
  const clanBadge = $('#badge-clan');
  const verifiedBadge = $('#badge-verified');
  const healthBar = $('#token-health-bar');
  const healthMsg = $('#token-health-message');

  if (!profile || !profile.valid) {
    if (banner) {
      banner.style.backgroundImage = 'linear-gradient(135deg, #18191c 0%, #2b2d31 60%, #35393e 100%)';
      banner.style.backgroundColor = '#18191c';
    }
    if (avatarImg) avatarImg.src = '/logo.png';
    if (statusDot) {
      statusDot.className = 'avatar-status-dot';
      statusDot.title = 'Offline';
    }
    if (globalName) globalName.textContent = 'Welcome Worker';
    if (handle) handle.textContent = '@not_connected';
    if (snowflake) snowflake.textContent = '------------------';
    if (createdText) createdText.textContent = 'Joined: --';
    if (nitroBadge) nitroBadge.classList.remove('visible');
    if (clanBadge) clanBadge.classList.remove('visible');
    if (verifiedBadge) verifiedBadge.classList.remove('visible');

    if (healthBar && healthMsg) {
      if (profile && profile.error) {
        healthBar.className = 'token-health-bar invalid';
        healthMsg.textContent = profile.error.toUpperCase();
      } else {
        healthBar.className = 'token-health-bar';
        healthMsg.textContent = 'PASTE A TOKEN TO CONNECT PROFILE';
      }
    }
    return;
  }

  // Valid Discord profile
  if (banner) {
    if (profile.banner_url) {
      banner.style.backgroundImage = `url('${profile.banner_url}')`;
    } else if (profile.accent_color) {
      banner.style.backgroundImage = `linear-gradient(135deg, ${profile.accent_color} 0%, #0d0e12 100%)`;
    } else {
      banner.style.backgroundImage = 'linear-gradient(135deg, #18191c 0%, #2b2d31 60%, #35393e 100%)';
    }
  }

  if (avatarImg) {
    avatarImg.src = profile.avatar_url;
    avatarImg.onerror = () => { avatarImg.src = '/logo.png'; };
  }

  if (statusDot) {
    statusDot.className = `avatar-status-dot ${botRunning ? 'online' : 'idle'}`;
    statusDot.title = botRunning ? 'Active bot online' : 'Token verified (standby)';
  }

  if (globalName) globalName.textContent = profile.global_name || profile.username;
  if (handle) handle.textContent = profile.tag || `@${profile.username}`;
  if (snowflake) snowflake.textContent = profile.id;

  if (createdText && profile.created_at) {
    const d = new Date(profile.created_at);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    createdText.textContent = `Joined ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  if (nitroBadge) {
    nitroBadge.classList.toggle('visible', Boolean(profile.nitro));
  }

  if (clanBadge) {
    if (profile.clan_tag) {
      clanBadge.textContent = `[${profile.clan_tag}]`;
      clanBadge.classList.add('visible');
    } else {
      clanBadge.classList.remove('visible');
    }
  }

  if (verifiedBadge) {
    verifiedBadge.classList.toggle('visible', Boolean(profile.verified));
  }

  if (healthBar && healthMsg) {
    healthBar.className = 'token-health-bar healthy';
    healthMsg.textContent = botRunning ? 'ACTIVE DISCORD BOT · ONLINE' : 'VALID DISCORD TOKEN · READY TO LAUNCH';
  }
}

async function fetchAndDisplayProfile(token) {
  const healthBar = $('#token-health-bar');
  const healthMsg = $('#token-health-message');
  if (!token || !token.trim()) {
    renderDiscordProfile(null);
    return;
  }
  if (healthBar && healthMsg) {
    healthBar.className = 'token-health-bar validating';
    healthMsg.textContent = 'VALIDATING DISCORD GATEWAY...';
  }
  try {
    const res = await apiFetch('/api/token/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token.trim() })
    });
    const data = await res.json().catch(() => ({}));
    if (data.ok && data.profile) {
      renderDiscordProfile(data.profile);
    } else {
      renderDiscordProfile({ valid: false, error: data.error || 'Invalid token' });
    }
  } catch (err) {
    renderDiscordProfile({ valid: false, error: 'Network error checking token' });
  }
}

function renderTokens() {
  const list = $('#tokens-list');
  if (!list) return;
  const token = (config.tokens || [])[0] || '';
  const masked = token.length > 14 ? token.slice(0, 8) + '••••••••' + token.slice(-4) : token ? token.slice(0, 4) + '••••' : 'Not configured';
  const inputType = tokenVisible ? 'text' : 'password';
  list.innerHTML = `<div class="item-row token-row">
    <div class="item-idx">01</div>
    <div class="item-body">
      <input class="token-input" type="${inputType}" data-field="token" value="${escapeHtml(token)}" placeholder="Paste one Discord token..." autocomplete="off">
      <small class="item-meta">Private token · <span class="token-mask">${escapeHtml(masked)}</span></small>
    </div>
    <button class="remove-btn" data-remove="token" type="button" aria-label="Clear token">✕</button>
  </div>`;
  updateCounts();
}

function renderRoutes() {
  const list = $('#routes-list');
  if (!list) return;
  const routes = config.routes || [];
  if (routes.length === 0) {
    list.innerHTML = `<div class="empty-note">No routes added. Click + ADD ROUTE to map a server to a channel.</div>`;
  } else {
    list.innerHTML = routes.map((r, i) => `
      <div class="item-row route-row" data-idx="${i}">
        <div class="item-idx">${pad2(i + 1)}</div>
        <div class="item-body route-body">
          <input type="text" class="route-name" data-field="routes-name" data-idx="${i}" value="${escapeHtml(r.name || '')}" placeholder="Route name (e.g. Main Server)" maxlength="80">
          <div class="route-grid">
            <label class="field micro-field"><span>SERVER ID</span><input type="text" class="route-server" data-field="routes-server" data-idx="${i}" value="${escapeHtml(r.serverId || '')}" placeholder="Guild ID" inputmode="numeric"></label>
            <label class="field micro-field"><span>CHANNEL ID</span><input type="text" class="route-channel" data-field="routes-channel" data-idx="${i}" value="${escapeHtml(r.channelId || '')}" placeholder="Channel ID" inputmode="numeric"></label>
          </div>
        </div>
        <button class="remove-btn" data-remove="routes" data-idx="${i}" type="button" aria-label="Remove route">✕</button>
      </div>
    `).join('');
  }
  updateCounts();
}

function renderMessages() {
  const list = $('#messages-list');
  if (!list) return;
  const msgs = config.messages || [];
  if (msgs.length === 0) {
    list.innerHTML = `<div class="empty-note">No messages in pool. Click + ADD MSG to insert a welcome line.</div>`;
  } else {
    list.innerHTML = msgs.map((msg, i) => `
      <div class="item-row msg-row" data-idx="${i}">
        <div class="item-idx">${pad2(i + 1)}</div>
        <div class="item-body msg-body">
          <textarea rows="3" data-field="messages" data-idx="${i}" maxlength="2000" placeholder="Welcome {tag}! Use {tag} to mention.">${escapeHtml(msg)}</textarea>
          <small class="item-meta"><span class="char-count">${String(msg).length}</span>/2000 chars · randomly weighted</small>
        </div>
        <button class="remove-btn" data-remove="messages" data-idx="${i}" type="button" aria-label="Remove message">✕</button>
      </div>
    `).join('');
  }
  updateCounts();
}

function renderClients(clients) {
  const box = $('#clients-list');
  const countEl = $('#bot-client-count');
  if (!box) return;
  if (!clients || clients.length === 0) {
    box.innerHTML = '';
    if (countEl) countEl.textContent = '0 AUTHORIZED BOT CONNECTIONS';
    return;
  }
  if (countEl) countEl.textContent = `${clients.length} AUTHORIZED BOT CONNECTION${clients.length === 1 ? '' : 'S'}`;
  box.innerHTML = clients.map(c => `
    <div class="client-row">
      <span class="client-dot ${c.online ? 'online' : 'offline'}"></span>
      <div>
        <strong>${escapeHtml(c.tag || 'Connecting...')}</strong>
        <small>${c.online ? 'ONLINE · LISTENING' : 'CONNECTING...'}</small>
      </div>
    </div>
  `).join('');
}

function renderLogs(logs) {
  const stream = $('#logs-stream');
  if (!stream) return;
  const items = logs || [];
  if (items.length === 0) {
    stream.innerHTML = `<div class="log-empty">No activity yet. Configure and START BOT to begin.</div>`;
    return;
  }
  stream.innerHTML = items.slice().reverse().map(l => {
    const d = new Date(l.time);
    const ts = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    return `<div class="log-line log-${l.level}"><span class="log-ts">[${ts}]</span> <span class="log-msg">${escapeHtml(l.message)}</span></div>`;
  }).join('');
}

// Global Event Delegation for Dynamic Inputs & Remove Buttons
document.addEventListener('input', (e) => {
  const field = e.target.dataset.field;
  if (!field) return;

  if (field === 'token') {
    const val = e.target.value.trim();
    config.tokens = val ? [val] : [];
    const row = e.target.closest('.item-row');
    if (row) {
      const meta = row.querySelector('.token-mask');
      const masked = val.length > 14 ? val.slice(0, 8) + '••••••••' + val.slice(-4) : (val ? val.slice(0, 4) + '••••' : 'Not configured');
      if (meta) meta.textContent = masked;
    }
    updateCounts();
    if (tokenLookupTimer) clearTimeout(tokenLookupTimer);
    tokenLookupTimer = setTimeout(() => {
      fetchAndDisplayProfile(val);
    }, 400);
  } else if (field === 'routes-name') {
    const i = Number(e.target.dataset.idx);
    if (config.routes && config.routes[i]) config.routes[i].name = e.target.value;
  } else if (field === 'routes-server') {
    const i = Number(e.target.dataset.idx);
    if (config.routes && config.routes[i]) config.routes[i].serverId = e.target.value.trim();
    updateCounts();
  } else if (field === 'routes-channel') {
    const i = Number(e.target.dataset.idx);
    if (config.routes && config.routes[i]) config.routes[i].channelId = e.target.value.trim();
    updateCounts();
  } else if (field === 'messages') {
    const i = Number(e.target.dataset.idx);
    if (config.messages && config.messages[i] !== undefined) {
      config.messages[i] = e.target.value;
      const row = e.target.closest('.msg-row');
      if (row) {
        const cc = row.querySelector('.char-count');
        if (cc) cc.textContent = String(e.target.value.length);
      }
    }
    updateCounts();
  }
});

// Single Delegated Click Listener for Remove Buttons (Prevents duplicate handlers!)
document.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('[data-remove]');
  if (!removeBtn) return;
  e.preventDefault();
  e.stopPropagation();

  const type = removeBtn.dataset.remove;
  const idx = Number(removeBtn.dataset.idx);

  if (type === 'token') {
    config.tokens = [];
    renderTokens();
    renderDiscordProfile(null);
    showToast('Token cleared');
  } else if (type === 'routes') {
    if (config.routes && config.routes.length > idx) {
      config.routes.splice(idx, 1);
      renderRoutes();
      showToast('Route removed');
    }
  } else if (type === 'messages') {
    if (config.messages && config.messages.length > idx) {
      config.messages.splice(idx, 1);
      renderMessages();
      showToast('Message removed');
    }
  }
});

let toastTimer = null;
function showToast(message) {
  const toast = $('#toast');
  if (!toast) return;
  if (toastTimer) clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('visible', 'show');
  toastTimer = window.setTimeout(() => toast.classList.remove('visible', 'show'), 2400);
}

function setBotStatus(running, status) {
  botRunning = running;
  const pill = $('#bot-status-pill');
  if (pill) {
    if (running) {
      pill.innerHTML = '<span class="status-dot"></span> BOT RUNNING';
      pill.classList.add('status-running');
    } else {
      pill.innerHTML = '<span class="status-dot status-off"></span> BOT STOPPED';
      pill.classList.remove('status-running');
    }
  }
  const startBtn = $('#bot-start');
  const stopBtn = $('#bot-stop');
  if (startBtn) startBtn.disabled = running;
  if (stopBtn) stopBtn.disabled = !running;
  
  if ($('#telemetry-label')) $('#telemetry-label').textContent = running ? 'LIVE' : 'STANDBY';
  if ($('#service-label')) $('#service-label').textContent = running ? 'WELCOME ENGINE LIVE' : 'SERVICE READY';
  if (status && status.clients) renderClients(status.clients);

  const dot = $('#avatar-status-dot');
  if (dot) {
    dot.className = `avatar-status-dot ${running ? 'online' : (currentProfile && currentProfile.valid ? 'idle' : '')}`;
    dot.title = running ? 'Bot online' : (currentProfile && currentProfile.valid ? 'Token standby' : 'Offline');
  }
  const healthBar = $('#token-health-bar');
  const healthMsg = $('#token-health-message');
  if (healthBar && healthMsg && currentProfile && currentProfile.valid) {
    healthBar.className = 'token-health-bar healthy';
    healthMsg.textContent = running ? 'ACTIVE DISCORD BOT · ONLINE' : 'VALID DISCORD TOKEN · READY TO LAUNCH';
  }
}

function populateForm() {
  if ($('#config-name')) $('#config-name').value = config.name || '';
  if ($('#config-name-display')) $('#config-name-display').textContent = config.name || 'Multi-Guild Welcome Workspace';
  if ($('#min-delay')) $('#min-delay').value = config.minDelay;
  if ($('#max-delay')) $('#max-delay').value = config.maxDelay;
  renderTokens();
  renderRoutes();
  renderMessages();
  updatePreview();
  updateCounts();
}

// Workspace Name
const configNameInput = $('#config-name');
if (configNameInput) {
  configNameInput.addEventListener('input', (e) => {
    config.name = e.target.value;
    const disp = $('#config-name-display');
    if (disp) disp.textContent = config.name || 'Multi-Guild Welcome Workspace';
  });
}

// Delays
const minDelayEl = $('#min-delay');
const maxDelayEl = $('#max-delay');
if (minDelayEl) minDelayEl.addEventListener('input', updatePreview);
if (maxDelayEl) maxDelayEl.addEventListener('input', onMaxDelayInput);

// Copy Snowflake ID
const copyIdBtn = $('#btn-copy-id');
if (copyIdBtn) {
  copyIdBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const idVal = $('#profile-snowflake')?.textContent?.trim();
    if (!idVal || idVal.includes('-')) {
      showToast('No active account ID to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(idVal);
      const actionText = $('#copy-status-text');
      if (actionText) actionText.textContent = 'COPIED!';
      copyIdBtn.classList.add('copied');
      showToast(`Copied Discord ID ${idVal}`);
      setTimeout(() => {
        if (actionText) actionText.textContent = 'COPY';
        copyIdBtn.classList.remove('copied');
      }, 1800);
    } catch {
      showToast('Clipboard access denied');
    }
  });
}

// Toggle Token Mask
const toggleTokenMaskBtn = $('#toggle-token-mask');
if (toggleTokenMaskBtn) {
  toggleTokenMaskBtn.addEventListener('click', (e) => {
    e.preventDefault();
    tokenVisible = !tokenVisible;
    const input = $('.token-input');
    if (input) {
      input.type = tokenVisible ? 'text' : 'password';
    }
    toggleTokenMaskBtn.textContent = tokenVisible ? '🔒 HIDE' : '👁 SHOW';
    showToast(tokenVisible ? 'Token unmasked (keep private)' : 'Token masked securely');
  });
}

// Add Route Button
const addRouteBtn = $('#add-route');
if (addRouteBtn) {
  addRouteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const n = (config.routes || []).length + 1;
    config.routes.push({ id: uid(), name: `Route #${n}`, serverId: '', channelId: '' });
    renderRoutes();
    showToast('Route added');
  });
}

// Add Message Button
const addMsgBtn = $('#add-message');
if (addMsgBtn) {
  addMsgBtn.addEventListener('click', (e) => {
    e.preventDefault();
    config.messages.push('Welcome {tag}! 🎉');
    renderMessages();
    updatePreview();
    showToast('Message added to pool');
  });
}

// Clear Logs Button
const clearLogsBtn = $('#clear-logs');
if (clearLogsBtn) {
  clearLogsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    renderLogs([]);
    showToast('Logs cleared locally');
  });
}

// Reset Config Button
const resetConfigBtn = $('#reset-config');
if (resetConfigBtn) {
  resetConfigBtn.addEventListener('click', (e) => {
    e.preventDefault();
    config = JSON.parse(JSON.stringify(savedConfig));
    populateForm();
    const token = (config.tokens || [])[0];
    if (token) fetchAndDisplayProfile(token);
    else renderDiscordProfile(null);
    showToast('Reverted to last saved config');
  });
}

// Save Config Button
const saveConfigBtn = $('#save-config');
if (saveConfigBtn) {
  saveConfigBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    saveConfigBtn.disabled = true;
    saveConfigBtn.innerHTML = '<span>SAVING...</span>';

    try {
      config.routes = (config.routes || []).map(r => ({
        ...r,
        serverId: String(r.serverId || '').trim(),
        channelId: String(r.channelId || '').trim()
      }));
      config.messages = (config.messages || []).filter(m => String(m).trim().length > 0);
      config.tokens = (config.tokens || []).filter(t => String(t).trim().length > 0).slice(0, 1);
      if (!config.name || !config.name.trim()) config.name = defaultConfig.name;

      const response = await apiFetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        showToast('Unable to save configuration');
        return;
      }

      const resData = await response.json();
      savedConfig = { ...config, ...resData };
      config = JSON.parse(JSON.stringify(savedConfig));
      populateForm();
      updatePreview();
      showToast('Configuration saved successfully');
      saveConfigBtn.innerHTML = '<span>✓ SAVED</span>';
      setTimeout(() => {
        saveConfigBtn.innerHTML = 'SAVE CONFIG <span>→</span>';
      }, 1500);
    } catch (err) {
      showToast('Network error while saving config');
      saveConfigBtn.innerHTML = 'SAVE CONFIG <span>→</span>';
    } finally {
      saveConfigBtn.disabled = false;
    }
  });
}

// Logout Button
const logoutBtn = $('#logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (statusPollTimer) clearInterval(statusPollTimer);
    if (logPollTimer) clearInterval(logPollTimer);
    try { await apiFetch('/api/logout', { method: 'POST' }); } catch {}
    window.location.href = '/slots.html';
  });
}

// Start Bot Button
const startBotBtn = $('#bot-start');
if (startBotBtn) {
  startBotBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (startBotBtn.disabled) return;
    startBotBtn.disabled = true;

    // 1. Gather all current inputs from the UI to ensure everything is saved before launch!
    const tokenInput = document.querySelector('.token-input');
    if (tokenInput) {
      const val = tokenInput.value.trim();
      config.tokens = val ? [val] : [];
    }

    // Messages (sync all textarea contents)
    const msgInputs = document.querySelectorAll('textarea[data-field="messages"]');
    if (msgInputs && msgInputs.length > 0) {
      config.messages = Array.from(msgInputs).map(t => t.value.trim()).filter(Boolean);
    }

    // Routes
    const routeRows = document.querySelectorAll('.route-row');
    if (routeRows && routeRows.length > 0) {
      config.routes = Array.from(routeRows).map((row, idx) => ({
        id: config.routes[idx]?.id || `r${idx + 1}`,
        name: row.querySelector('.route-name')?.value?.trim() || `Route #${idx + 1}`,
        serverId: row.querySelector('.route-server')?.value?.trim() || '',
        channelId: row.querySelector('.route-channel')?.value?.trim() || ''
      }));
    }

    // Delays
    const minInput = $('#min-delay');
    const maxInput = $('#max-delay');
    if (minInput) config.minDelay = Math.max(1, Number(minInput.value) || 2);
    if (maxInput) config.maxDelay = Math.max(config.minDelay, Number(maxInput.value) || 5);

    showToast('Saving setup & starting bot engine...');

    try {
      // 2. Auto-save config to server
      const saveRes = await apiFetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (saveRes.ok) {
        const resData = await saveRes.json();
        savedConfig = { ...config, ...resData };
      }

      // 3. Launch the bot
      const res = await apiFetch('/api/bot/start', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Failed to start bot');
      } else {
        showToast('Bot engine starting...');
      }
    } catch {
      showToast('Network error while starting bot');
    } finally {
      startBotBtn.disabled = false;
      await refreshStatus();
      await refreshLogs();
    }
  });
}

// Stop Bot Button
const stopBotBtn = $('#bot-stop');
if (stopBotBtn) {
  stopBotBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    stopBotBtn.disabled = true;
    showToast('Stopping bot service...');

    try {
      await apiFetch('/api/bot/stop', { method: 'POST' });
      showToast('Bot stopped');
    } catch {
      showToast('Network error while stopping bot');
    } finally {
      await refreshStatus();
      await refreshLogs();
    }
  });
}

let dashboardUptime = 0;
let uptimeTicker = null;

function formatUptime(totalSec) {
  const s = Math.floor(totalSec % 60);
  const m = Math.floor((totalSec / 60) % 60);
  const h = Math.floor(totalSec / 3600);
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

function updateTelemetryStats(data, measuredPing) {
  let displayPing = measuredPing || 1;
  let isWsPing = false;
  if (botRunning && data && data.host && typeof data.host.pingMs === 'number' && data.host.pingMs >= 0) {
    displayPing = data.host.pingMs;
    isWsPing = true;
  }

  const pingStr = `${displayPing} ms`;
  if ($('#console-ping-val')) $('#console-ping-val').textContent = pingStr;
  if ($('#sys-ping-val')) $('#sys-ping-val').textContent = pingStr;
  if ($('#sys-ping-sub')) {
    $('#sys-ping-sub').textContent = isWsPing ? 'Discord Gateway WS' : 'Dashboard Latency';
  }

  const pingDots = [$('#console-ping-dot'), $('#sys-ping-dot')];
  pingDots.forEach(dot => {
    if (!dot) return;
    dot.className = 'stat-pulse-dot';
    if (displayPing > 280) dot.classList.add('offline');
    else if (displayPing > 120) dot.classList.add('idle');
  });

  if (data && data.host && typeof data.host.dashboardUptimeSeconds === 'number') {
    dashboardUptime = data.host.dashboardUptimeSeconds;
  } else if (data && data.host && typeof data.host.uptimeSeconds === 'number') {
    dashboardUptime = data.host.uptimeSeconds;
  }
  const uptimeStr = formatUptime(dashboardUptime);
  if ($('#console-uptime-val')) $('#console-uptime-val').textContent = uptimeStr;
  if ($('#sys-uptime-val')) $('#sys-uptime-val').textContent = uptimeStr;

  const gwVal = $('#console-gateway-val');
  const gwDot = $('#console-gateway-dot');
  const hasToken = (config.tokens || []).some(t => String(t).trim().length > 0);

  if (botRunning) {
    if (gwVal) gwVal.textContent = 'ONLINE';
    if (gwDot) gwDot.className = 'stat-indicator-mini online';
    if ($('#sys-gateway-sub')) $('#sys-gateway-sub').textContent = 'Gateway: Online';
  } else if (hasToken) {
    if (gwVal) gwVal.textContent = 'STANDBY';
    if (gwDot) gwDot.className = 'stat-indicator-mini standby';
    if ($('#sys-gateway-sub')) $('#sys-gateway-sub').textContent = 'Gateway: Standby';
  } else {
    if (gwVal) gwVal.textContent = 'IDLE';
    if (gwDot) gwDot.className = 'stat-indicator-mini offline';
    if ($('#sys-gateway-sub')) $('#sys-gateway-sub').textContent = 'Gateway: No Token';
  }

  if (data && data.host) {
    if ($('#sys-memory-val')) $('#sys-memory-val').textContent = `${data.host.memoryMb || 0} MB`;
    if ($('#sys-heap-val')) $('#sys-heap-val').textContent = `Heap: ${data.host.heapMb || 0} MB`;
    if ($('#sys-runtime-val')) $('#sys-runtime-val').textContent = data.host.runtime ? `Node ${data.host.runtime}` : 'Node.js';
  }
}

let consecutive401s = 0;

async function refreshStatus() {
  const pingStart = performance.now();
  try {
    const r = await apiFetch('/api/bot/status');
    const measuredPing = Math.max(1, Math.round(performance.now() - pingStart));
    if (r.status === 401) {
      consecutive401s++;
      // Only redirect if 401 persists for 3 consecutive polls (12 seconds)
      // This protects against temporary server reloads or Render wake-ups!
      if (consecutive401s >= 3) {
        window.location.href = `/slots.html?locked=1&slot=${currentSlotId}`;
      }
      return;
    }
    consecutive401s = 0;
    const data = await r.json().catch(() => ({ running: false }));
    setBotStatus(Boolean(data.running), data);
    updateTelemetryStats(data, measuredPing);
  } catch (e) {
    const measuredPing = Math.max(1, Math.round(performance.now() - pingStart));
    updateTelemetryStats({ running: false }, measuredPing);
  }
}

async function refreshLogs() {
  try {
    const r = await apiFetch('/api/bot/logs');
    if (r.status === 401) return;
    const data = await r.json().catch(() => ({ logs: [] }));
    renderLogs(data.logs || []);
  } catch (e) {}
}

// Initialize Dashboard
(async () => {
  const padSlot = String(currentSlotId).padStart(2, '0');
  if ($('#user-node-badge')) $('#user-node-badge').textContent = `NODE ${padSlot}`;
  if ($('#sys-enclave-badge')) $('#sys-enclave-badge').textContent = `NODE ${padSlot}`;

  if (!uptimeTicker) {
    uptimeTicker = setInterval(() => {
      dashboardUptime++;
      const formatted = formatUptime(dashboardUptime);
      if ($('#console-uptime-val')) $('#console-uptime-val').textContent = formatted;
      if ($('#sys-uptime-val')) $('#sys-uptime-val').textContent = formatted;
    }, 1000);
  }

  try {
    const meRes = await apiFetch('/api/me');
    if (meRes.ok) {
      const meData = await meRes.json().catch(() => ({}));
      const badge = $('#user-node-badge');
      if (badge && meData.username) {
        badge.textContent = meData.username.toUpperCase().replace('_', ' ');
      }
      const sysBadge = $('#sys-enclave-badge');
      if (sysBadge && meData.username) {
        sysBadge.textContent = meData.username.toUpperCase().replace('_', ' ');
      }
    }
  } catch (e) {}

  try {
    const response = await apiFetch('/api/config');
    if (response.status === 401) {
      window.location.href = `/slots.html?locked=1&slot=${currentSlotId}`;
      return;
    }
    const loaded = await response.json();
    config = {
      name: loaded.name || defaultConfig.name,
      minDelay: typeof loaded.minDelay === 'number' ? loaded.minDelay : defaultConfig.minDelay,
      maxDelay: typeof loaded.maxDelay === 'number' ? loaded.maxDelay : defaultConfig.maxDelay,
      tokens: Array.isArray(loaded.tokens) ? loaded.tokens.slice(0, 1) : [],
      routes: (loaded.routes && loaded.routes.length) ? loaded.routes : JSON.parse(JSON.stringify(defaultConfig.routes)),
      messages: (loaded.messages && loaded.messages.length) ? loaded.messages : [...defaultConfig.messages]
    };
    savedConfig = JSON.parse(JSON.stringify(config));
    populateForm();
    const initialToken = (config.tokens || [])[0];
    if (initialToken) {
      fetchAndDisplayProfile(initialToken);
    } else {
      renderDiscordProfile(null);
    }
    await refreshStatus();
    await refreshLogs();
    statusPollTimer = setInterval(refreshStatus, 4000);
    logPollTimer = setInterval(refreshLogs, 2500);
  } catch (err) {
    showToast('Failed to load configuration');
  }
})();
