const grid = document.querySelector('#slot-grid');
const toast = document.querySelector('#toast');
const cursorGlow = document.querySelector('.cursor-glow');
let toastTimer = null;

function showToast(message) {
  if (!toast) return;
  if (toastTimer) clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
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

function render(slots) {
  if (!grid) return;
  const urlParams = new URLSearchParams(window.location.search);
  const targetSlotId = Number(urlParams.get('slot') || 0);

  grid.innerHTML = slots.map(slot => {
    const idPad = String(slot.id).padStart(2, '0');
    const isTarget = slot.id === targetSlotId;

    if (slot.myAccess) {
      return `<article class="slot open ${isTarget ? 'highlight-target' : ''}" data-id="${slot.id}" tabindex="0" role="region" aria-label="Node ${idPad}">
        <div class="slot-head">
          <span class="slot-number">NODE ${idPad}</span>
          <span class="slot-status online">AUTHENTICATED</span>
        </div>
        <h2>Welcomer Slot ${idPad}</h2>
        <span class="slot-meta">WELCOME BOT READY · ${escapeHtml(slot.plan || 'ACTIVE')}</span>
        <div class="slot-actions">
          <a href="/dashboard.html?slot=${slot.id}" class="open-btn">OPEN DASHBOARD →</a>
        </div>
      </article>`;
    } else if (slot.hasKey) {
      const isExpired = Boolean(slot.isExpired);
      return `<article class="slot ${isTarget ? 'highlight-target' : ''}" data-id="${slot.id}" tabindex="0" role="region" aria-label="Node ${idPad}">
        <div class="slot-head">
          <span class="slot-number">NODE ${idPad}</span>
          <span class="slot-status ${isExpired ? 'expired' : 'protected'}">${isExpired ? 'EXPIRED' : 'KEY PROTECTED'}</span>
        </div>
        <h2>Welcomer Slot ${idPad}</h2>
        <span class="slot-meta">${isExpired ? 'SUBSCRIPTION EXPIRED · RENEW' : `LICENSE: ${escapeHtml(slot.plan || 'PROTECTED')}`}</span>
        ${isExpired ? `
          <div class="expired-wrap">
            <div class="expired-notice">License expired. Contact administrator to renew.</div>
            <a href="https://discord.gg/unq" target="_blank" rel="noopener noreferrer" class="contact-buy-btn renew-btn">
              <span class="btn-discord-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
              </span>
              <span>RENEW AT DISCORD.GG/UNQ ↗</span>
            </a>
          </div>
        ` : `
          <form class="unlock-form" data-id="${slot.id}" onsubmit="return false;">
            <input 
              type="password" 
              name="password" 
              placeholder="Enter node access key..." 
              autocomplete="off" 
              maxlength="128"
            >
            <button 
              type="submit" 
              class="unlock-btn" 
              data-action="unlock"
            >UNLOCK WITH KEY</button>
          </form>
        `}
      </article>`;
    } else {
      return `<article class="slot unassigned ${isTarget ? 'highlight-target' : ''}" data-id="${slot.id}" tabindex="0" role="region" aria-label="Node ${idPad}">
        <div class="slot-head">
          <span class="slot-number">NODE ${idPad}</span>
          <span class="slot-status unassigned">UNASSIGNED</span>
        </div>
        <h2>Welcomer Slot ${idPad}</h2>
        <span class="slot-meta">AVAILABLE TO LEASE · GET KEY ON DISCORD</span>
        <div class="slot-actions">
          <a href="https://discord.gg/unq" target="_blank" rel="noopener noreferrer" class="contact-buy-btn">
            <span class="btn-discord-icon">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
            </span>
            <span>CONTACT ADMIN TO BUY</span>
            <span class="btn-arrow">↗</span>
          </a>
        </div>
      </article>`;
    }
  }).join('');

  grid.querySelectorAll('.slot').forEach(card => {
    const isOnline = card.classList.contains('open');
    const id = Number(card.dataset.id);

    if (isOnline) {
      // Direct navigation on clicking anywhere on an authenticated card
      card.addEventListener('click', (e) => {
        if (e.target.tagName !== 'A' && !e.target.closest('a')) {
          window.location.href = `/dashboard.html?slot=${id}`;
        }
      });
    } else {
      const input = card.querySelector('input[name="password"]');
      const form = card.querySelector('.unlock-form');
      const btn = card.querySelector('.unlock-btn');

      card.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'A' && !e.target.closest('a') && input) {
          input.focus();
        }
      });

      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          doUnlock(id, input ? input.value : '', card, btn);
        });
      }

      if (form) {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          e.stopPropagation();
          doUnlock(id, input ? input.value : '', card, btn);
        });
      }
    }
  });

  // If a target slot was specified in URL, auto-focus its input
  if (targetSlotId) {
    const targetCard = grid.querySelector(`.slot[data-id="${targetSlotId}"]`);
    if (targetCard) {
      const input = targetCard.querySelector('input[name="password"]');
      if (input) {
        setTimeout(() => input.focus(), 150);
      }
      targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

async function doUnlock(id, password, card, btn) {
  if (!id) return showToast('Slot not found.');
  const pw = String(password || '').trim();
  const input = card ? card.querySelector('input[name="password"]') : null;

  if (!pw) {
    showToast('Please enter the slot password.');
    if (input) input.focus();
    return;
  }

  if (btn) btn.disabled = true;
  showToast(`Authenticating Node ${String(id).padStart(2, '0')}...`);

  try {
    const response = await fetch('/api/slots/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: Number(id), password: pw })
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 429) {
      return showToast(data.error || 'Too many attempts. Try again in a few minutes.');
    }

    if (!response.ok) {
      if (input) {
        input.value = '';
        input.focus();
      }
      return showToast(data.error || 'Invalid slot password.');
    }

    if (data.token) {
      localStorage.setItem('unq_slot_session', data.token);
      localStorage.setItem('unq_slot_id', String(id));
    }

    showToast(`Node ${String(id).padStart(2, '0')} unlocked! Opening dashboard...`);
    setTimeout(() => {
      window.location.href = `/dashboard.html?slot=${id}`;
    }, 200);
  } catch (err) {
    showToast('Network error. Check connection and try again.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function load() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('locked')) {
    const sId = urlParams.get('slot') || '1';
    showToast(`🔒 Node ${String(sId).padStart(2, '0')} is password protected. Enter key.`);
  } else if (urlParams.get('expired')) {
    const sId = urlParams.get('slot') || '1';
    showToast(`⚠️ Node ${String(sId).padStart(2, '0')} subscription has expired.`);
  } else if (urlParams.get('unassigned')) {
    const sId = urlParams.get('slot') || '1';
    showToast(`🔒 Node ${String(sId).padStart(2, '0')} is not assigned yet.`);
  }

  const savedToken = localStorage.getItem('unq_slot_session');
  const headers = savedToken ? { 'X-Slot-Token': savedToken } : {};

  try {
    const response = await fetch('/api/slots', { headers, credentials: 'same-origin' });
    if (!response.ok) throw new Error('Failed');
    const data = await response.json();
    render(data.slots || []);
  } catch {
    showToast('Slot service unavailable.');
  }

  try {
    const meRes = await fetch('/api/me', { headers, credentials: 'same-origin' });
    if (meRes.ok) {
      const me = await meRes.json();
      const banner = document.querySelector('#active-session-banner');
      if (banner && me.username) {
        banner.style.display = 'flex';
        const targetSlot = me.slotId || (me.subscriptions && me.subscriptions[0] ? me.subscriptions[0].replace('node:', '') : '1');
        banner.innerHTML = `<div>
          <span class="eyebrow" style="margin-bottom:2px;">AUTHENTICATED SESSION</span>
          <strong>Active Container: ${escapeHtml(me.username.toUpperCase().replace('_', ' '))}</strong>
        </div>
        <a href="/dashboard.html?slot=${targetSlot}" class="resume-dash-btn">RESUME DASHBOARD →</a>`;
      }
    }
  } catch (e) {}
}

load().catch(() => showToast('Slot service unavailable.'));
