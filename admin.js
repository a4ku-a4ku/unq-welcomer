const loginView = document.querySelector('#login-view');
const panelView = document.querySelector('#panel-view');
const grid = document.querySelector('#admin-grid');
const toast = document.querySelector('#admin-toast');
const cursorGlow = document.querySelector('.cursor-glow');
const errorBanner = document.querySelector('#login-error');
const adminStatusText = document.querySelector('#admin-status-text');

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
}

let toastTimer = null;
function showToast(message) {
  if (!toast) return;
  if (toastTimer) clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// Cursor Spotlight tracking from Quest 2.0
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

// Password visibility toggle
const togglePwBtn = document.querySelector('#toggle-pw-btn');
const adminPwInput = document.querySelector('#admin-password');
if (togglePwBtn && adminPwInput) {
  togglePwBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isPw = adminPwInput.type === 'password';
    adminPwInput.type = isPw ? 'text' : 'password';
    togglePwBtn.textContent = isPw ? '🔒' : '👁';
  });
}

function showLogin() {
  if (loginView) {
    loginView.hidden = false;
    loginView.style.display = 'flex';
  }
  if (panelView) {
    panelView.hidden = true;
    panelView.style.display = 'none';
  }
  if (adminStatusText) adminStatusText.textContent = 'SECURE ENCLAVE';
}

function showPanel() {
  if (loginView) {
    loginView.hidden = true;
    loginView.style.display = 'none';
  }
  if (panelView) {
    panelView.hidden = false;
    panelView.style.display = 'flex';
  }
  if (adminStatusText) adminStatusText.textContent = 'AUTHENTICATED';
}

function render(slots) {
  if (!grid) return;
  grid.innerHTML = slots.map(slot => {
    const idPad = String(slot.id).padStart(2, '0');
    const isAssigned = Boolean(slot.hasKey);
    const isExpired = Boolean(slot.isExpired);
    const statusText = isExpired ? 'EXPIRED' : (isAssigned ? 'ASSIGNED' : 'UNASSIGNED');
    const statusClass = isExpired ? 'expired' : (isAssigned ? 'ready' : '');
    const daysRemaining = slot.expiresAt ? Math.max(0, Math.ceil((slot.expiresAt - Date.now()) / 86400000)) : null;
    const planText = slot.plan || (slot.expiresAt ? `${daysRemaining}d left` : (isAssigned ? 'Lifetime' : 'None'));
    const customerInfo = slot.customerNote ? escapeHtml(slot.customerNote) : 'Unassigned / Open';
    const lastUsed = slot.lastUsedAt ? `LAST ACTIVE ${new Date(slot.lastUsedAt).toLocaleString()}` : 'NO RUNTIME USAGE';
    const portalUrl = `http://${window.location.host}/dashboard.html?slot=${slot.id}`;

    const buyerReceipt = `🔑 WELCOMER NODE ${idPad} ACCESS CREDENTIALS\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Key: ${slot.activeKey || 'KEY-S' + idPad + '-****'}\n` +
      `Container: Node ${idPad}\n` +
      `Plan: ${planText}${daysRemaining !== null ? ` (${daysRemaining} days left)` : ''}\n` +
      `Customer: ${slot.customerNote || 'Valued Buyer'}\n` +
      `Portal: ${portalUrl}\n` +
      `Discord Support: https://discord.gg/unq\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `How to activate:\n` +
      `1. Open portal link above (or /slots.html)\n` +
      `2. Enter your key to unlock your dedicated container\n` +
      `3. Configure your Discord selfbot & welcome routes`;

    return `<article class="admin-card" data-id="${slot.id}">
      <div>
        <div class="admin-card-head">
          <span class="eyebrow">NODE ${idPad}</span>
          <span class="status ${statusClass}">${statusText}</span>
        </div>
        <h2>Service Container ${idPad}</h2>
        <small>${lastUsed}</small>
        
        ${isAssigned ? `
          <!-- Key Details Block -->
          <div class="key-card-block">
            <div class="key-card-head">
              <span class="key-card-label">GENERATED ACCESS KEY</span>
              <span class="key-card-badge">${isExpired ? 'EXPIRED' : 'ACTIVE'}</span>
            </div>
            <div class="key-val-row">
              <code class="key-val-text" data-key="${escapeHtml(slot.activeKey || '')}">${escapeHtml(slot.activeKey || 'KEY RE-ISSUE NEEDED')}</code>
              <button type="button" class="btn-copy-key" data-copy="${escapeHtml(slot.activeKey || '')}">COPY KEY</button>
            </div>
          </div>

          <!-- Metadata Grid -->
          <div class="node-meta-grid">
            <div class="node-meta-item"><span>PLAN:</span> <strong>${escapeHtml(planText)}</strong></div>
            <div class="node-meta-item"><span>CUSTOMER:</span> <strong>${customerInfo}</strong></div>
            <div class="node-meta-item"><span>EXPIRES:</span> <strong>${slot.expiresAt ? new Date(slot.expiresAt).toLocaleDateString() : 'Permanent'}</strong></div>
            <div class="node-meta-item"><span>DAYS LEFT:</span> <strong>${daysRemaining !== null ? `${daysRemaining}d` : '∞'}</strong></div>
          </div>

          <!-- Buyer Receipt -->
          <div class="receipt-box">${escapeHtml(buyerReceipt)}</div>
          <button type="button" class="copy-receipt-btn" data-copy="${escapeHtml(buyerReceipt)}">📋 COPY RECEIPT FOR BUYER</button>
        ` : `
          <div class="unassigned-notice">
            Container node ready for lease. Select plan duration and customer tag below to generate a sellable key.
          </div>
        `}
      </div>

      <div>
        <form class="generate" data-id="${slot.id}">
          <label class="admin-field">
            <span>LEASE DURATION</span>
            <select class="plan-select" data-id="${slot.id}">
              <option value="30">30 Days (Monthly)</option>
              <option value="7">7 Days (Weekly/Trial)</option>
              <option value="90">90 Days (Quarterly)</option>
              <option value="0">Lifetime (Permanent)</option>
            </select>
          </label>
          <label class="admin-field">
            <span>CUSTOMER / ORDER TAG</span>
            <input type="text" class="customer-input" data-id="${slot.id}" placeholder="e.g. @Alex or Order #104" value="${escapeHtml(slot.customerNote || '')}">
          </label>
          <button type="submit" class="gen-btn" data-id="${slot.id}">${isAssigned ? 'RE-ISSUE / SELL NEW KEY' : 'GENERATE & SELL KEY'}</button>
        </form>
        ${isAssigned ? `<button class="reset" data-reset="${slot.id}" type="button">REVOKE & LOCK ACCESS</button>` : ''}
      </div>
    </article>`;
  }).join('');

  grid.querySelectorAll('.admin-card').forEach(card => {
    const id = Number(card.dataset.id);
    const form = card.querySelector('.generate');
    const genBtn = card.querySelector('.gen-btn');
    const resetBtn = card.querySelector('[data-reset]');

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();
        generate(id, card, genBtn);
      });
    }

    if (genBtn) {
      genBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        generate(id, card, genBtn);
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        resetSlot(id, resetBtn);
      });
    }
  });
}

async function generate(id, card, genBtn) {
  if (!id) return showToast('Invalid slot ID');
  const targetBtn = genBtn || (card ? card.querySelector('.gen-btn') : null);
  if (targetBtn) targetBtn.disabled = true;

  const planSelect = card ? card.querySelector('.plan-select') : null;
  const customerInput = card ? card.querySelector('.customer-input') : null;
  const days = planSelect ? Number(planSelect.value) : 30;
  const note = customerInput ? customerInput.value.trim() : '';

  try {
    const response = await fetch('/api/admin/slots/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id), days, note })
    });

    if (response.status === 401) {
      showToast('Admin session expired. Please sign in again.');
      return showLogin();
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) return showToast(data.error || 'Generation failed.');

    const idPad = String(id).padStart(2, '0');
    showToast(`Node ${idPad} access key generated & saved!`);
    await loadSlots();
  } catch {
    showToast('Network error. Please try again.');
  } finally {
    if (targetBtn) targetBtn.disabled = false;
  }
}

// Copy button event delegation with fallback
document.addEventListener('click', async (e) => {
  const copyBtn = e.target.closest('[data-copy]');
  if (copyBtn) {
    e.preventDefault();
    e.stopPropagation();
    const text = copyBtn.getAttribute('data-copy');
    if (!text) return showToast('Nothing to copy');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      const prev = copyBtn.textContent;
      copyBtn.textContent = '✓ COPIED';
      setTimeout(() => { copyBtn.textContent = prev; }, 1800);
      showToast('Copied to clipboard');
    } catch {
      prompt('Copy key manually:', text);
    }
  }
});

async function resetSlot(id, resetBtn) {
  if (!id) return;
  const idPad = String(id).padStart(2, '0');
  if (!confirm(`Revoke and reset Node ${idPad}? All active runtime sessions for this container will be terminated.`)) return;

  if (resetBtn) resetBtn.disabled = true;

  try {
    const response = await fetch('/api/admin/slots/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id) })
    });

    if (response.status === 401) {
      showToast('Admin session expired. Please sign in again.');
      return showLogin();
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) return showToast(data.error || 'Reset failed.');

    showToast(`Node ${idPad} revoked & reset.`);
    await loadSlots();
  } catch {
    showToast('Network error. Please try again.');
  } finally {
    if (resetBtn) resetBtn.disabled = false;
  }
}

async function loadSlots() {
  try {
    const response = await fetch('/api/admin/slots');
    if (response.status === 401) {
      showLogin();
      return;
    }
    if (!response.ok) return showToast('Failed to load slots.');
    const data = await response.json().catch(() => ({ slots: [] }));
    showPanel();
    render(data.slots || []);
  } catch {
    showToast('Network error. Please try again.');
  }
}

async function doLogin(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const password = adminPwInput ? adminPwInput.value.trim() : '';
  if (!password) {
    if (errorBanner) {
      errorBanner.textContent = 'Please enter admin password.';
      errorBanner.style.display = 'block';
    }
    if (adminPwInput) adminPwInput.focus();
    return;
  }

  const submitBtn = document.querySelector('#admin-login button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  if (errorBanner) errorBanner.style.display = 'none';

  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (errorBanner) {
        errorBanner.textContent = data.error || 'Access denied. Master key invalid.';
        errorBanner.style.display = 'block';
      }
      return;
    }
    if (adminPwInput) adminPwInput.value = '';
    showToast('Admin authenticated');
    showPanel();
    await loadSlots();
  } catch {
    if (errorBanner) {
      errorBanner.textContent = 'Network error. Please try again.';
      errorBanner.style.display = 'block';
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

const adminLoginForm = document.querySelector('#admin-login');
if (adminLoginForm) {
  adminLoginForm.addEventListener('submit', doLogin);
}

const adminSubmitBtn = document.querySelector('#admin-login button[type="submit"]');
if (adminSubmitBtn) {
  adminSubmitBtn.addEventListener('click', doLogin);
}

// Change Master Key Modal
const changePwModal = document.querySelector('#change-pw-modal');
const openChangePwBtn = document.querySelector('#open-change-pw-btn');
const closeChangePwBtn = document.querySelector('#close-change-pw-btn');
const cancelChangePwBtn = document.querySelector('#cancel-change-pw-btn');
const changePwForm = document.querySelector('#change-pw-form');
const currentPwInput = document.querySelector('#current-pw');
const newPwInput = document.querySelector('#new-pw');
const confirmPwInput = document.querySelector('#confirm-pw');
const changePwError = document.querySelector('#change-pw-error');
const savePwBtn = document.querySelector('#save-pw-btn');

function openModal() {
  if (changePwModal) {
    changePwModal.hidden = false;
    changePwModal.style.display = 'flex';
  }
  if (changePwError) changePwError.style.display = 'none';
  if (currentPwInput) {
    currentPwInput.value = '';
    currentPwInput.focus();
  }
  if (newPwInput) newPwInput.value = '';
  if (confirmPwInput) confirmPwInput.value = '';
}

function closeModal() {
  if (changePwModal) {
    changePwModal.hidden = true;
    changePwModal.style.display = 'none';
  }
  if (changePwError) changePwError.style.display = 'none';
}

if (openChangePwBtn) openChangePwBtn.addEventListener('click', openModal);
if (closeChangePwBtn) closeChangePwBtn.addEventListener('click', closeModal);
if (cancelChangePwBtn) cancelChangePwBtn.addEventListener('click', closeModal);

if (changePwModal) {
  changePwModal.addEventListener('click', (e) => {
    if (e.target === changePwModal) closeModal();
  });
}

if (changePwForm) {
  changePwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPassword = currentPwInput ? currentPwInput.value.trim() : '';
    const newPassword = newPwInput ? newPwInput.value.trim() : '';
    const confirmPassword = confirmPwInput ? confirmPwInput.value.trim() : '';

    if (!currentPassword || !newPassword) {
      if (changePwError) {
        changePwError.textContent = 'Please fill in all fields.';
        changePwError.style.display = 'block';
      }
      return;
    }

    if (newPassword.length < 8) {
      if (changePwError) {
        changePwError.textContent = 'New master key must be at least 8 characters long.';
        changePwError.style.display = 'block';
      }
      return;
    }

    if (newPassword !== confirmPassword) {
      if (changePwError) {
        changePwError.textContent = 'New master key and confirmation do not match.';
        changePwError.style.display = 'block';
      }
      return;
    }

    if (savePwBtn) savePwBtn.disabled = true;
    if (changePwError) changePwError.style.display = 'none';

    try {
      const response = await fetch('/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (changePwError) {
          changePwError.textContent = data.error || 'Failed to update master key.';
          changePwError.style.display = 'block';
        }
        return;
      }
      closeModal();
      showToast('Master admin key successfully updated!');
    } catch {
      if (changePwError) {
        changePwError.textContent = 'Network error. Please try again.';
        changePwError.style.display = 'block';
      }
    } finally {
      if (savePwBtn) savePwBtn.disabled = false;
    }
  });
}

const logoutBtn = document.querySelector('#logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    try { await fetch('/api/admin/logout', { method: 'POST' }); } catch {}
    showLogin();
    showToast('Signed out');
  });
}

const refreshBtn = document.querySelector('#refresh-slots');
if (refreshBtn) {
  refreshBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    refreshBtn.disabled = true;
    try {
      await loadSlots();
      showToast('Slots refreshed');
    } finally {
      refreshBtn.disabled = false;
    }
  });
}

// Initial state check
showLogin();
loadSlots();
