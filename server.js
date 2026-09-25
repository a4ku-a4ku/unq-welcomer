const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let DiscordClient = null;
try { DiscordClient = require('discord.js-selfbot-v13').Client; } catch (e) { DiscordClient = null; }

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const configFile = path.join(root, 'user-configs.json');
const slotFile = path.join(root, 'slot-data.json');
const adminConfigFile = path.join(root, 'admin-config.json');
const sessionFile = path.join(root, 'sessions.json');
let sessions = new Map();
const adminSessions = new Map();
const loginAttempts = new Map();
const ADMIN_SESSION_TTL = 1000 * 60 * 60 * 2;
const RATE_LIMIT_WINDOW = 1000 * 60 * 15;
const RATE_LIMIT_MAX_ATTEMPTS = 50;
const ADMIN_RATE_LIMIT_MAX = 5;
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png' };

const defaultConfig = {
  name: 'My Welcome Setup',
  minDelay: 2,
  maxDelay: 5,
  tokens: [],
  routes: [{ id: 'r1', name: 'Main Server', serverId: '', channelId: '' }],
  messages: ['Welcome {tag} to the server!']
};

process.on('uncaughtException', (err) => {
  console.error('[CRASH GUARD - UNCAUGHT EXCEPTION]:', err && err.message ? err.message : err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[CRASH GUARD - UNHANDLED REJECTION]:', reason && reason.message ? reason.message : reason);
});

const botInstances = new Map();
const botLogs = new Map();
const botTimers = new Map();
const profileCache = new Map();

async function fetchDiscordProfile(token) {
  if (!token || typeof token !== 'string') return { valid: false, error: 'No token provided' };
  const trimmed = token.trim();
  if (trimmed.length < 20) return { valid: false, error: 'Invalid token format' };

  const tokenHash = crypto.createHash('sha256').update(trimmed).digest('hex');
  const cached = profileCache.get(tokenHash);
  if (cached && Date.now() - cached.cachedAt < 60000) {
    return cached.profile;
  }

  try {
    const res = await fetch('https://discord.com/api/v9/users/@me', {
      headers: {
        'Authorization': trimmed,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.ok) {
      const errRes = { valid: false, error: res.status === 401 ? 'Invalid or expired Discord token' : `Discord API Error (${res.status})` };
      profileCache.set(tokenHash, { profile: errRes, cachedAt: Date.now() });
      return errRes;
    }

    const u = await res.json();
    const cleanProfile = {
      valid: true,
      id: u.id,
      username: u.username,
      global_name: u.global_name || u.username,
      tag: u.discriminator && u.discriminator !== '0' ? `${u.username}#${u.discriminator}` : `@${u.username}`,
      avatar: u.avatar,
      avatar_url: u.avatar
        ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${u.avatar.startsWith('a_') ? 'gif' : 'png'}?size=256`
        : `https://cdn.discordapp.com/embed/avatars/${(BigInt(u.id || 0) >> 22n) % 6n}.png`,
      banner_url: u.banner
        ? `https://cdn.discordapp.com/banners/${u.id}/${u.banner}.${u.banner.startsWith('a_') ? 'gif' : 'png'}?size=512`
        : null,
      accent_color: u.accent_color ? `#${u.accent_color.toString(16).padStart(6, '0')}` : (u.banner_color || null),
      clan_tag: u.clan ? u.clan.tag : (u.primary_guild ? u.primary_guild.tag : null),
      nitro: Boolean(u.premium_type && u.premium_type > 0),
      verified: Boolean(u.verified),
      mfa_enabled: Boolean(u.mfa_enabled),
      created_at: Number((BigInt(u.id || 0) >> 22n) + 1420070400000n)
    };

    profileCache.set(tokenHash, { profile: cleanProfile, cachedAt: Date.now() });
    return cleanProfile;
  } catch (err) {
    return { valid: false, error: `Failed to reach Discord: ${err.message}` };
  }
}



function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) {
  const tmpFile = `${file}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmpFile, file);
  } catch {
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
    fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
  }
}

function loadSessions() {
  const data = readJson(sessionFile, {});
  const map = new Map();
  const now = Date.now();
  for (const [token, sess] of Object.entries(data)) {
    if (sess && sess.createdAt && (now - sess.createdAt < 1000 * 60 * 60 * 24 * 7)) {
      map.set(token, sess);
    }
  }
  return map;
}

function saveSessions() {
  const obj = {};
  for (const [token, sess] of sessions.entries()) {
    obj[token] = sess;
  }
  writeJson(sessionFile, obj);
}

sessions = loadSessions();

function hashSecret(secret, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.createHash('sha256').update(`${salt}:${secret}`).digest('hex')}`;
}

function verifySecret(secret, stored) {
  const [salt, digest] = String(stored || '').split(':');
  if (!salt || !digest) return false;
  const expected = crypto.createHash('sha256').update(`${salt}:${secret}`).digest('hex');
  return Boolean(digest.length === expected.length && crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(expected)));
}

function getAdminPasswordHash() {
  if (process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.trim().length > 0) {
    return hashSecret(process.env.ADMIN_PASSWORD.trim(), 'adm-salt-2026');
  }
  const cfg = readJson(adminConfigFile, null);
  if (cfg && cfg.passwordHash) {
    return cfg.passwordHash;
  }
  const initial = hashSecret('admin123');
  writeJson(adminConfigFile, {
    passwordHash: initial,
    updatedAt: Date.now(),
    note: 'Initial master key is admin123. Please change it via the Admin Control Station.'
  });
  return initial;
}

function setAdminPassword(newPassword) {
  const newHash = hashSecret(newPassword);
  writeJson(adminConfigFile, {
    passwordHash: newHash,
    updatedAt: Date.now()
  });
  return newHash;
}

function getClientIp(request) {
  const xff = request.headers['x-forwarded-for'];
  if (xff && typeof xff === 'string') {
    const parts = xff.split(',');
    if (parts.length > 0) {
      const first = parts[0].trim();
      if (first) return first;
    }
  }
  return (request.socket && request.socket.remoteAddress) ? request.socket.remoteAddress : '127.0.0.1';
}

function isRequestSecure(request) {
  const proto = request.headers['x-forwarded-proto'];
  if (proto && proto.toLowerCase() === 'https') return true;
  return Boolean(request.connection && request.connection.encrypted);
}
function body(request) { return new Promise((resolve, reject) => { let data = ''; request.on('data', (chunk) => { data += chunk; if (data.length > 100000) reject(new Error('Body too large')); }); request.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('Invalid JSON')); } }); }); }
function send(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'X-XSS-Protection': '1; mode=block'
  });
  response.end(JSON.stringify(data));
}
function parseCookies(request) {
  const header = request.headers.cookie || '';
  const list = {};
  header.split(';').forEach(c => {
    const pair = c.trim().split('=');
    if (pair.length >= 2) list[pair[0]] = pair.slice(1).join('=');
  });
  return list;
}
function session(request) {
  const cookies = parseCookies(request);
  const userToken = request.headers['x-slot-token'] || cookies.session;
  if (userToken && sessions.has(userToken)) {
    const s = sessions.get(userToken);
    if (s.slotId) {
      const slots = slotState();
      const slot = slots.find(item => item.id === s.slotId);
      if (!slot || (slot.expiresAt && Date.now() > slot.expiresAt)) {
        sessions.delete(userToken);
        saveSessions();
        return null;
      }
    }
    return s;
  }
  const adminToken = cookies.admin_session;
  if (adminToken && adminSessions.has(adminToken)) {
    let targetSlot = 1;
    try {
      const u = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const qs = u.searchParams.get('slot') || request.headers['x-slot-id'];
      if (qs && Number(qs) >= 1 && Number(qs) <= 12) {
        targetSlot = Number(qs);
      } else if (request.headers.referer) {
        const refUrl = new URL(request.headers.referer);
        const refSlot = refUrl.searchParams.get('slot');
        if (refSlot && Number(refSlot) >= 1 && Number(refSlot) <= 12) {
          targetSlot = Number(refSlot);
        }
      }
    } catch {}
    const adminSlotUser = `slot_${String(targetSlot).padStart(2, '0')}`;
    return {
      username: adminSlotUser,
      role: 'admin',
      slotId: targetSlot,
      subscriptions: Array.from({ length: 12 }, (_, i) => `node:${i + 1}`),
      createdAt: Date.now()
    };
  }
  return null;
}
function requireSession(request, response) { const current = session(request); if (!current) { send(response, 401, { error: 'Sign in required.' }); return null; } return current; }
function slotState() {
  const data = readJson(slotFile, { slots: [] });
  const slots = Array.from({ length: 12 }, (_, i) => data.slots[i] || {
    id: i + 1,
    status: 'offline',
    passwordHash: null,
    unlockedAt: null,
    lastUsedAt: null,
    customerNote: null,
    plan: null,
    expiresAt: null
  });

  // Ensure Slot 1 always has an initial active key initialized so it is never locked/unassigned out of the box
  if (!slots[0].passwordHash) {
    const defaultKey = 'KEY-S01-UNQ-2026';
    slots[0].passwordHash = hashSecret(defaultKey, 'unq-s01-master');
    slots[0].activeKey = defaultKey;
    slots[0].plan = 'Lifetime';
    slots[0].customerNote = 'Master Container Node 01';
    slots[0].createdAt = Date.now();
    writeSlots(slots);
  }

  return slots;
}
function writeSlots(slots) { writeJson(slotFile, { slots }); }
function publicSlot(slot, currentSession = null) {
  const isExpired = Boolean(slot.expiresAt && Date.now() > slot.expiresAt);
  const hasKey = Boolean(slot.passwordHash && !isExpired);
  // On public portal, access is strictly granted only if visitor unlocked this slot with its key
  const myAccess = Boolean(!isExpired && currentSession && currentSession.role !== 'admin' && (
    currentSession.slotId === slot.id ||
    currentSession.username === `slot_${String(slot.id).padStart(2, '0')}`
  ));
  const botInst = botInstances.get(`slot_${String(slot.id).padStart(2, '0')}`);
  const botRunning = Boolean(botInst && botInst.length > 0);

  return {
    id: slot.id,
    hasKey,
    unlocked: hasKey,
    status: myAccess ? 'online' : (hasKey ? 'protected' : 'unassigned'),
    botRunning,
    myAccess,
    isExpired,
    expiresAt: slot.expiresAt || null,
    plan: slot.plan || (slot.expiresAt ? 'Time-Limited' : (hasKey ? 'Lifetime' : 'Unassigned')),
    unlockedAt: slot.unlockedAt,
    lastUsedAt: slot.lastUsedAt
  };
}

function adminSlot(slot) {
  const isExpired = Boolean(slot.expiresAt && Date.now() > slot.expiresAt);
  const hasKey = Boolean(slot.passwordHash && !isExpired);
  const botInst = botInstances.get(`slot_${String(slot.id).padStart(2, '0')}`);
  const botRunning = Boolean(botInst && botInst.length > 0);

  return {
    id: slot.id,
    hasKey: Boolean(slot.passwordHash),
    activeKey: slot.activeKey || null,
    status: isExpired ? 'expired' : (slot.passwordHash ? 'assigned' : 'unassigned'),
    botRunning,
    isExpired,
    createdAt: slot.createdAt || null,
    expiresAt: slot.expiresAt || null,
    plan: slot.plan || (slot.expiresAt ? 'Time-Limited' : (slot.passwordHash ? 'Lifetime' : 'Unassigned')),
    customerNote: slot.customerNote || null,
    unlockedAt: slot.unlockedAt || null,
    lastUsedAt: slot.lastUsedAt || null
  };
}
function requireAdmin(request, response) {
  const cookies = parseCookies(request);
  const token = cookies.admin_session;
  if (!token || !adminSessions.has(token)) { send(response, 401, { error: 'Admin access required.' }); return null; }
  const sess = adminSessions.get(token);
  if (Date.now() - sess.createdAt > ADMIN_SESSION_TTL) {
    adminSessions.delete(token);
    send(response, 401, { error: 'Session expired. Please sign in again.' });
    return null;
  }
  return sess;
}
function checkRateLimit(key, maxAttempts = RATE_LIMIT_MAX_ATTEMPTS, windowMs = RATE_LIMIT_WINDOW) {
  const now = Date.now();
  const record = loginAttempts.get(key) || { count: 0, windowStart: now };
  if (now - record.windowStart > windowMs) {
    record.count = 0;
    record.windowStart = now;
  }
  record.count += 1;
  loginAttempts.set(key, record);
  return record.count <= maxAttempts;
}
function cleanupExpiredSessions() {
  const now = Date.now();
  for (const [token, sess] of adminSessions) {
    if (now - sess.createdAt > ADMIN_SESSION_TTL) adminSessions.delete(token);
  }
  for (const [key, rec] of loginAttempts) {
    if (now - rec.windowStart > RATE_LIMIT_WINDOW) loginAttempts.delete(key);
  }
}
setInterval(cleanupExpiredSessions, 1000 * 60 * 10);

function enforceSlotExpirations() {
  const slots = slotState();
  const now = Date.now();
  let changed = false;
  slots.forEach(slot => {
    if (slot.expiresAt && now > slot.expiresAt) {
      const slotUser = `slot_${String(slot.id).padStart(2, '0')}`;
      if (botInstances.has(slotUser)) {
        stopBot(slotUser);
        pushLog(slotUser, 'error', '⏰ License expired. Bot stopped automatically.');
      }
      for (const [token, sess] of sessions.entries()) {
        if (sess.slotId === slot.id || sess.username === slotUser) {
          sessions.delete(token);
        }
      }
      saveSessions();
      if (slot.status !== 'expired') {
        slot.status = 'expired';
        changed = true;
      }
    }
  });
  if (changed) writeSlots(slots);
}
setInterval(enforceSlotExpirations, 1000 * 30);

function pushLog(username, level, message) {
  if (!botLogs.has(username)) botLogs.set(username, []);
  const logs = botLogs.get(username);
  logs.push({ time: Date.now(), level, message });
  if (logs.length > 200) logs.splice(0, logs.length - 200);
}

function getBotStatus(username) {
  const instances = botInstances.get(username) || [];
  const primary = instances[0];
  const memory = process.memoryUsage();
  const serverUptimeSeconds = Math.floor(process.uptime());
  const botUptimeSeconds = primary && primary.startedAt
    ? Math.max(0, Math.floor((Date.now() - primary.startedAt) / 1000))
    : 0;
  const ping = primary && primary.client && primary.client.ws && Number.isFinite(primary.client.ws.ping)
    ? Math.max(0, Math.round(primary.client.ws.ping))
    : null;
  return {
    running: instances.length > 0,
    clientCount: instances.length,
    host: {
      uptimeSeconds: serverUptimeSeconds,
      dashboardUptimeSeconds: serverUptimeSeconds,
      botUptimeSeconds,
      pingMs: ping,
      memoryMb: Math.round(memory.rss / 1024 / 1024),
      heapMb: Math.round(memory.heapUsed / 1024 / 1024),
      runtime: process.version,
      platform: process.platform,
      serverTime: Date.now(),
      updatedAt: Date.now()
    },
    clients: instances.map(inst => ({
      tag: inst.tag || 'Connecting...',
      username: inst.client && inst.client.user ? inst.client.user.username : null,
      avatar: inst.client && inst.client.user && typeof inst.client.user.displayAvatarURL === 'function'
        ? inst.client.user.displayAvatarURL({ extension: 'png', size: 128 })
        : null,
      online: inst.online || false
    }))
  };
}

const botTransitioning = new Map();
const lastStoppedAt = new Map();

function stopBot(username) {
  const pending = botTimers.get(username);
  if (pending) {
    pending.forEach(t => clearTimeout(t));
    botTimers.delete(username);
  }
  const instances = botInstances.get(username) || [];
  instances.forEach(inst => {
    try {
      if (inst.client) {
        inst.client.removeAllListeners();
        if (typeof inst.client.destroy === 'function') {
          inst.client.destroy();
        }
      }
    } catch (e) {}
  });
  botInstances.delete(username);
  lastStoppedAt.set(username, Date.now());
  pushLog(username, 'info', 'All bot instances stopped.');
}

async function startBot(username) {
  if (botTransitioning.get(username)) {
    return { ok: false, error: 'Bot engine is currently busy starting or stopping. Please wait a moment.' };
  }
  botTransitioning.set(username, true);

  try {
    const configs = readJson(configFile, {});
    const cfg = { ...defaultConfig, ...(configs[username] || (username === 'slot_01' ? configs['AAKU'] : null) || {}) };
    const tokens = (cfg.tokens || []).filter(t => typeof t === 'string' && t.trim().length > 0).slice(0, 1);
    const routes = (cfg.routes || []).filter(r => r && r.serverId && r.channelId);
    const messages = (cfg.messages || []).filter(m => typeof m === 'string' && m.trim().length > 0);
    const minDelay = Math.max(1, Number(cfg.minDelay) || 2);
    const maxDelay = Math.max(minDelay, Number(cfg.maxDelay) || 5);

    stopBot(username);

    if (!DiscordClient) {
      pushLog(username, 'error', 'discord.js-selfbot-v13 not installed. Run: npm install discord.js-selfbot-v13');
      return { ok: false, error: 'Dependency missing' };
    }
    if (tokens.length === 0) {
      pushLog(username, 'error', 'No tokens configured. Add at least one Discord token in Setup.');
      return { ok: false, error: 'No tokens configured' };
    }
    if (routes.length === 0) {
      pushLog(username, 'error', 'No routes configured. Add at least one server/channel pair.');
      return { ok: false, error: 'No routes configured' };
    }
    if (messages.length === 0) {
      pushLog(username, 'error', 'No welcome messages configured. Add at least one message.');
      return { ok: false, error: 'No messages configured' };
    }

    // Discord Gateway Cooldown Protection:
    // Discord Gateway enforces rate limits on identifies. If stopped recently, wait 2.5s to let socket cleanly close.
    const timeSinceStop = Date.now() - (lastStoppedAt.get(username) || 0);
    if (timeSinceStop < 2500) {
      const waitMs = 2500 - timeSinceStop;
      pushLog(username, 'info', `⏳ Gateway Cooldown: waiting ${(waitMs / 1000).toFixed(1)}s for previous connection to terminate...`);
      await new Promise(r => setTimeout(r, waitMs));
    }

    const instances = [];
    tokens.forEach((rawToken, idx) => {
      const token = rawToken.trim();
      try {
        const client = new DiscordClient({ checkUpdate: false });
        const inst = { client, tag: null, online: false, tokenIdx: idx, startedAt: Date.now() };
        instances.push(inst);

        client.on('ready', () => {
          inst.tag = client.user ? (client.user.tag || `@${client.user.username}`) : `Token #${idx + 1}`;
          inst.online = true;
          pushLog(username, 'success', `✅ Account Online: ${inst.tag} (${client.user ? client.user.id : ''})`);
        });

        client.on('error', (err) => {
          pushLog(username, 'error', `⚠️ Discord Gateway: ${err.message || 'Connection glitch'}`);
        });

        client.on('shardError', (err) => {
          pushLog(username, 'error', `⚠️ Gateway Shard Error: ${err.message || 'Network glitch'}`);
        });

        client.on('shardDisconnect', (event) => {
          inst.online = false;
          const code = event && event.code ? event.code : 'Unknown';
          const reason = event && event.reason ? event.reason : 'Connection closed';
          if (code === 4004) {
            pushLog(username, 'error', `❌ Invalid Discord Token (Code 4004): Token has expired or password was changed.`);
          } else {
            pushLog(username, 'warn', `⚠️ Gateway Disconnected (${code}): ${reason}`);
          }
        });

        client.on('rateLimit', (info) => {
          const timeout = info && info.timeout ? (info.timeout / 1000).toFixed(1) : '?';
          pushLog(username, 'warn', `⏳ Discord Gateway Rate Limit: Backing off for ${timeout}s`);
        });

        client.on('invalidated', () => {
          inst.online = false;
          pushLog(username, 'error', '❌ Discord session invalidated by Gateway. Stopping.');
          stopBot(username);
        });

        client.on('guildMemberAdd', async (member) => {
          const serverID = member.guild.id;
          const route = routes.find(r => String(r.serverId) === String(serverID));
          if (!route) return;

          pushLog(username, 'info', `📢 Join detected in [${member.guild.name}]: ${member.user.tag || member.user.username}`);

          const channel = await client.channels.fetch(String(route.channelId)).catch(() => null);
          if (!channel) { pushLog(username, 'error', `Channel [${route.channelId}] not found in ${member.guild.name}`); return; }

          const delaySec = Math.random() * (maxDelay - minDelay) + minDelay;
          const delayMs = Math.floor(delaySec * 1000);

          if (!botTimers.has(username)) botTimers.set(username, new Set());
          const userTimers = botTimers.get(username);

          const timer = setTimeout(async () => {
            userTimers.delete(timer);
            const randomMsg = messages[Math.floor(Math.random() * messages.length)];
            const memberCount = member.guild.memberCount || '?';
            let finalMsg = randomMsg
              .replace(/\{tag\}/g, `<@${member.id}>`)
              .replace(/\{user\}/g, `<@${member.id}>`)
              .replace(/\{mention\}/g, `<@${member.id}>`)
              .replace(/\{username\}/g, member.user.username)
              .replace(/\{server\}/g, member.guild.name)
              .replace(/\{guild\}/g, member.guild.name)
              .replace(/\{count\}/g, String(memberCount));

            if (!finalMsg.includes(`<@${member.id}>`)) {
              finalMsg = `${finalMsg} <@${member.id}>`;
            }

            try {
              await channel.send(finalMsg);
              pushLog(username, 'success', `🚀 Welcomed ${member.user.username} in #${channel.name || 'channel'} (${member.guild.name}) [Delay: ${delaySec.toFixed(1)}s]`);
            } catch (err) {
              pushLog(username, 'error', `❌ Send Fail in ${member.guild.name}: ${err.message}`);
            }
          }, delayMs);
          userTimers.add(timer);
        });

        const safePrefix = token.length > 8 ? `${token.slice(0, 4)}...****` : '****';
        client.login(token).catch((err) => {
          inst.online = false;
          pushLog(username, 'error', `❌ Login Fail (Token #${idx + 1} ${safePrefix}): ${err.message || 'Unauthorized / expired'}`);
          const currentInsts = botInstances.get(username) || [];
          const remaining = currentInsts.filter(i => i !== inst);
          if (remaining.length === 0) {
            botInstances.delete(username);
          } else {
            botInstances.set(username, remaining);
          }
        });
      } catch (err) {
        pushLog(username, 'error', `❌ Client init fail: ${err.message}`);
      }
    });

    botInstances.set(username, instances);
    pushLog(username, 'info', `Connecting ${instances.length} bot account(s) to Discord Gateway...`);
    return { ok: true };
  } finally {
    botTransitioning.delete(username);
  }
}


function api(request, response, pathname) {
  if (pathname === '/api/ping' && request.method === 'GET') {
    return send(response, 200, { ok: true, uptime: Math.floor(process.uptime()), serverTime: Date.now() });
  }

  if (pathname === '/api/slots' && request.method === 'GET') {
    const cur = session(request);
    return send(response, 200, {
      slots: slotState().map(s => publicSlot(s, cur)),
      mySession: cur ? { username: cur.username, role: cur.role, subscriptions: cur.subscriptions } : null
    });
  }

  if (pathname === '/api/slots/open' && request.method === 'POST') return body(request).then((input) => {
    const id = Number(input.id);
    const cur = session(request);
    if (!cur) return send(response, 401, { error: 'Access key required to unlock this slot.' });
    const targetUsername = `slot_${String(id).padStart(2, '0')}`;
    if (cur.role !== 'admin' && cur.username !== targetUsername && !(cur.subscriptions && cur.subscriptions.includes(`node:${id}`))) {
      return send(response, 403, { error: 'Access key required for this specific slot.' });
    }
    const slots = slotState();
    const slot = slots.find(item => item.id === id);
    if (!slot) return send(response, 404, { error: 'Slot not found.' });
    if (slot.expiresAt && Date.now() > slot.expiresAt) {
      return send(response, 403, { error: 'Slot subscription has expired.' });
    }
    slot.lastUsedAt = Date.now();
    writeSlots(slots);
    return send(response, 200, { ok: true, slot: publicSlot(slot, cur), username: cur.username });
  }).catch(() => send(response, 400, { error: 'Invalid open request.' }));

  if (pathname === '/api/slots/unlock' && request.method === 'POST') return body(request).then((input) => {
    const clientIp = getClientIp(request);
    const rlKey = `unlock:${clientIp}`;
    if (!checkRateLimit(rlKey, 10, RATE_LIMIT_WINDOW)) return send(response, 429, { error: 'Too many attempts. Try again later.' });
    const id = Number(input.id);
    const slots = slotState();
    const slot = slots.find(item => item.id === id);
    if (!slot) return send(response, 404, { error: 'Slot not found.' });
    if (!slot.passwordHash) return send(response, 400, { error: 'This slot has no access key generated. Contact admin to acquire.' });

    if (slot.expiresAt && Date.now() > slot.expiresAt) {
      return send(response, 403, { error: 'This slot subscription has expired. Please contact admin to renew.' });
    }

    if (!verifySecret(String(input.password || '').trim(), slot.passwordHash)) {
      return send(response, 401, { error: 'Invalid access key. Please verify and try again.' });
    }

    loginAttempts.delete(rlKey);
    slot.status = 'online';
    slot.unlockedAt = slot.unlockedAt || Date.now();
    slot.lastUsedAt = Date.now();
    writeSlots(slots);

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const slotUsername = `slot_${String(id).padStart(2, '0')}`;
    const newSession = {
      username: slotUsername,
      role: 'user',
      slotId: id,
      subscriptions: [`node:${id}`],
      createdAt: Date.now()
    };
    sessions.set(sessionToken, newSession);
    saveSessions();

    const sec = isRequestSecure(request) ? '; Secure' : '';
    response.writeHead(200, {
      'Set-Cookie': `session=${sessionToken}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${sec}`,
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      'X-XSS-Protection': '1; mode=block'
    });
    response.end(JSON.stringify({
      ok: true,
      token: sessionToken,
      slot: publicSlot(slot, newSession),
      username: slotUsername
    }));
  }).catch(() => send(response, 400, { error: 'Invalid unlock request.' }));

  if (pathname === '/api/admin/login' && request.method === 'POST') return body(request).then((input) => {
    const clientIp = getClientIp(request);
    const rlKey = `admin:${clientIp}`;
    if (!checkRateLimit(rlKey, ADMIN_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW)) {
      return send(response, 429, { error: 'Too many failed login attempts. Locked out for 15 minutes.' });
    }
    const pw = String(input.password || '').trim();
    if (!pw) return send(response, 400, { error: 'Master key required.' });

    const expectedHash = getAdminPasswordHash();
    const isMasterValid = verifySecret(pw, expectedHash);
    if (!isMasterValid) return send(response, 401, { error: 'Invalid master administrator key.' });

    loginAttempts.delete(rlKey);
    const token = crypto.randomBytes(32).toString('hex');
    adminSessions.set(token, { createdAt: Date.now(), ip: clientIp });

    const sec = isRequestSecure(request) ? '; Secure' : '';
    response.writeHead(200, {
      'Set-Cookie': `admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=7200${sec}`,
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      'X-XSS-Protection': '1; mode=block'
    });
    response.end('{"ok":true}');
  }).catch(() => send(response, 400, { error: 'Invalid admin request.' }));

  if (pathname === '/api/admin/logout' && request.method === 'POST') {
    const cookies = parseCookies(request);
    const token = cookies.admin_session;
    if (token) adminSessions.delete(token);
    const sec = isRequestSecure(request) ? '; Secure' : '';
    response.writeHead(200, {
      'Set-Cookie': `admin_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict${sec}`,
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      'X-XSS-Protection': '1; mode=block'
    });
    return response.end('{"ok":true}');
  }

  if (pathname === '/api/admin/password' && request.method === 'POST') {
    const adminSess = requireAdmin(request, response);
    if (!adminSess) return;
    return body(request).then((input) => {
      const currentPw = String(input.currentPassword || '').trim();
      const newPw = String(input.newPassword || '').trim();
      if (!currentPw || !newPw) {
        return send(response, 400, { error: 'Current and new master keys are required.' });
      }
      if (newPw.length < 8) {
        return send(response, 400, { error: 'New master key must be at least 8 characters long.' });
      }
      const expectedHash = getAdminPasswordHash();
      if (!verifySecret(currentPw, expectedHash)) {
        return send(response, 401, { error: 'Current master key is incorrect.' });
      }
      setAdminPassword(newPw);
      console.log(`[SECURITY] Master admin key updated by IP ${getClientIp(request)}`);
      return send(response, 200, { ok: true, message: 'Master administrator key updated successfully.' });
    }).catch(() => send(response, 400, { error: 'Invalid password change request.' }));
  }

  if (pathname === '/api/admin/slots' && request.method === 'GET') {
    const adminSess = requireAdmin(request, response);
    if (!adminSess) return;
    return send(response, 200, { slots: slotState().map(s => adminSlot(s)) });
  }

  if (pathname === '/api/admin/slots/generate' && request.method === 'POST') {
    const adminSess = requireAdmin(request, response);
    if (!adminSess) return;
    return body(request).then((input) => {
      const id = Number(input.id);
      const days = Number(input.days) || 0; // 0 = Lifetime
      const note = String(input.note || '').trim().slice(0, 100);
      const plan = days > 0 ? `${days} Days` : 'Lifetime';
      const slots = slotState();
      const slot = slots.find(item => item.id === id);
      if (!slot) return send(response, 404, { error: 'Slot not found.' });

      const keySuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
      const keySuffix2 = crypto.randomBytes(4).toString('hex').toUpperCase();
      const password = `KEY-S${String(id).padStart(2, '0')}-${keySuffix}-${keySuffix2}`;

      slot.passwordHash = hashSecret(password);
      slot.activeKey = password;
      slot.createdAt = Date.now();
      slot.status = 'offline';
      slot.unlockedAt = null;
      slot.lastUsedAt = null;
      slot.customerNote = note;
      slot.plan = plan;
      slot.expiresAt = days > 0 ? Date.now() + (days * 86400000) : null;

      // Invalidate existing sessions for this slot
      for (const [sToken, sData] of sessions.entries()) {
        if (sData.username === `slot_${String(id).padStart(2, '0')}`) {
          sessions.delete(sToken);
        }
      }
      saveSessions();
      stopBot(`slot_${String(id).padStart(2, '0')}`);

      writeSlots(slots);
      send(response, 200, { ok: true, password, slot: adminSlot(slot) });
    }).catch(() => send(response, 400, { error: 'Invalid slot request.' }));
  }

  if (pathname === '/api/admin/slots/reset' && request.method === 'POST') {
    const adminSess = requireAdmin(request, response);
    if (!adminSess) return;
    return body(request).then((input) => {
      const id = Number(input.id);
      const slots = slotState();
      const slot = slots.find(item => item.id === id);
      if (!slot) return send(response, 404, { error: 'Slot not found.' });

      slot.passwordHash = null;
      slot.activeKey = null;
      slot.createdAt = null;
      slot.status = 'offline';
      slot.unlockedAt = null;
      slot.lastUsedAt = null;
      slot.customerNote = null;
      slot.plan = null;
      slot.expiresAt = null;

      // Invalidate existing sessions for this slot
      for (const [sToken, sData] of sessions.entries()) {
        if (sData.username === `slot_${String(id).padStart(2, '0')}`) {
          sessions.delete(sToken);
        }
      }
      saveSessions();
      stopBot(`slot_${String(id).padStart(2, '0')}`);

      writeSlots(slots);
      send(response, 200, { ok: true, slot: adminSlot(slot) });
    }).catch(() => send(response, 400, { error: 'Invalid slot request.' }));
  }

  if (pathname === '/api/logout' && request.method === 'POST') {
    const token = request.headers['x-slot-token'] || (request.headers.cookie || '').match(/session=([^;]+)/)?.[1];
    if (token) {
      sessions.delete(token);
      saveSessions();
    }
    response.writeHead(200, {
      'Set-Cookie': 'session=; Max-Age=0; Path=/',
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
      'X-XSS-Protection': '1; mode=block'
    });
    return response.end('{"ok":true}');
  }

  if (pathname === '/api/me' && request.method === 'GET') {
    const current = requireSession(request, response);
    return current && send(response, 200, { username: current.username, role: current.role, subscriptions: current.subscriptions || [] });
  }

  if (pathname === '/api/config' && request.method === 'GET') {
    const current = requireSession(request, response); if (!current) return;
    const configs = readJson(configFile, {});
    const userCfg = configs[current.username] || (current.username === 'slot_01' ? configs['AAKU'] : null) || {};
    const merged = { ...defaultConfig, ...userCfg };
    merged.routes = (merged.routes && merged.routes.length) ? merged.routes : defaultConfig.routes;
    merged.messages = (merged.messages && merged.messages.length) ? merged.messages : defaultConfig.messages;
    merged.tokens = merged.tokens || [];
    return send(response, 200, merged);
  }

  if (pathname === '/api/config' && request.method === 'PUT') return body(request).then((input) => {
    const current = requireSession(request, response); if (!current) return;
    const configs = readJson(configFile, {});
    const routes = Array.isArray(input.routes) ? input.routes.filter(r => r).map((r, i) => ({
      id: String(r.id || `r${i + 1}`),
      name: String(r.name || `Route #${i + 1}`).slice(0, 80),
      serverId: String(r.serverId || '').trim(),
      channelId: String(r.channelId || '').trim()
    })) : defaultConfig.routes;
    const messages = Array.isArray(input.messages) ? input.messages.filter(m => typeof m === 'string').map(m => String(m).slice(0, 2000)) : defaultConfig.messages;
    const tokens = Array.isArray(input.tokens)
      ? input.tokens.filter(t => typeof t === 'string').map(t => String(t).trim()).filter(Boolean).slice(0, 1)
      : [];
    const minDelay = Math.max(0, Number(input.minDelay));
    const maxDelay = Math.max(minDelay, Number(input.maxDelay));
    configs[current.username] = {
      name: String(input.name || defaultConfig.name).slice(0, 80),
      minDelay: isNaN(minDelay) ? defaultConfig.minDelay : minDelay,
      maxDelay: isNaN(maxDelay) ? defaultConfig.maxDelay : maxDelay,
      routes, messages, tokens
    };
    if (current.username === 'slot_01') {
      configs['AAKU'] = configs[current.username];
    }
    writeJson(configFile, configs);
    send(response, 200, configs[current.username]);
  }).catch(() => send(response, 400, { error: 'Invalid configuration.' }));

  if (pathname === '/api/bot/status' && request.method === 'GET') {
    const current = requireSession(request, response); if (!current) return;
    return send(response, 200, getBotStatus(current.username));
  }

  if (pathname === '/api/bot/start' && request.method === 'POST') {
    const current = requireSession(request, response); if (!current) return true;
    startBot(current.username).then((result) => {
      send(response, result.ok ? 200 : 400, { ...result, status: getBotStatus(current.username) });
    }).catch((err) => {
      send(response, 500, { ok: false, error: err.message });
    });
    return true;
  }

  if (pathname === '/api/bot/stop' && request.method === 'POST') {
    const current = requireSession(request, response); if (!current) return;
    stopBot(current.username);
    return send(response, 200, { ok: true, status: getBotStatus(current.username) });
  }

  if (pathname === '/api/bot/logs' && request.method === 'GET') {
    const current = requireSession(request, response); if (!current) return;
    return send(response, 200, { logs: botLogs.get(current.username) || [] });
  }

  if (pathname === '/api/token/profile' && request.method === 'GET') {
    const current = requireSession(request, response); if (!current) return;
    const configs = readJson(configFile, {});
    const userCfg = configs[current.username] || (current.username === 'slot_01' ? configs['AAKU'] : null) || {};
    const token = Array.isArray(userCfg.tokens) && userCfg.tokens[0] ? userCfg.tokens[0] : null;
    if (!token) return send(response, 200, { ok: false, error: 'No token configured', profile: null });
    fetchDiscordProfile(token).then((profile) => {
      send(response, 200, { ok: profile.valid, profile });
    }).catch(err => {
      send(response, 200, { ok: false, error: err.message, profile: null });
    });
    return true;
  }

  if (pathname === '/api/token/profile' && request.method === 'POST') {
    const current = requireSession(request, response); if (!current) return;
    body(request).then(async (input) => {
      const token = typeof input.token === 'string' ? input.token.trim() : '';
      if (!token) return send(response, 200, { ok: false, error: 'Empty token', profile: null });
      const profile = await fetchDiscordProfile(token);
      return send(response, 200, { ok: profile.valid, profile });
    }).catch(() => send(response, 400, { error: 'Invalid token request.' }));
    return true;
  }

  return false;
}

http.createServer((request, response) => {
  const SEC_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'X-XSS-Protection': '1; mode=block'
  };
  const parsedUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  if (pathname.startsWith('/api/')) { if (api(request, response, pathname) !== false) return; return send(response, 404, { error: 'Not found.' }); }

  // Strict Protection: Block access to sensitive server files, configs, and source
  const lowerPath = pathname.toLowerCase();
  if (
    lowerPath.endsWith('.json') ||
    lowerPath.endsWith('.env') ||
    lowerPath.endsWith('.tmp') ||
    lowerPath.endsWith('.log') ||
    lowerPath === '/server.js' ||
    lowerPath.includes('..') ||
    lowerPath.includes('.git') ||
    lowerPath.includes('node_modules')
  ) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', ...SEC_HEADERS });
    return response.end('Forbidden');
  }

  const current = session(request);
  if (pathname === '/') { response.writeHead(302, { Location: '/slots.html', ...SEC_HEADERS }); return response.end(); }
  if (pathname === '/index.html') { response.writeHead(302, { Location: '/dashboard.html', ...SEC_HEADERS }); return response.end(); }
  if (pathname === '/dashboard.html') {
    const slotQuery = parsedUrl.searchParams.get('slot');
    const targetId = slotQuery ? Number(slotQuery) : (current && current.slotId ? current.slotId : 1);
    const targetUsername = `slot_${String(targetId).padStart(2, '0')}`;
    const slots = slotState();
    const targetSlot = slots.find(item => item.id === targetId);

    // If slot doesn't exist or has no key assigned
    if (!targetSlot || !targetSlot.passwordHash) {
      response.writeHead(302, { Location: `/slots.html?unassigned=1&slot=${targetId}`, ...SEC_HEADERS });
      return response.end();
    }

    // If slot license expired
    if (targetSlot.expiresAt && Date.now() > targetSlot.expiresAt) {
      response.writeHead(302, { Location: `/slots.html?expired=1&slot=${targetId}`, ...SEC_HEADERS });
      return response.end();
    }

    // Check if requester has an unlocked session specifically for this slot or is administrator
    const hasAccess = Boolean(current && (
      current.role === 'admin' ||
      current.slotId === targetId ||
      current.username === targetUsername
    ));

    if (hasAccess) {
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        ...SEC_HEADERS
      });
      return fs.createReadStream(path.join(root, 'index.html')).pipe(response);
    }

    // Not authenticated for this slot -> Redirect to unlock on slots page!
    response.writeHead(302, { Location: `/slots.html?locked=1&slot=${targetId}`, ...SEC_HEADERS });
    return response.end();
  }
  if (pathname === '/favicon.ico') { response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600', ...SEC_HEADERS }); return fs.createReadStream(path.join(root, 'logo.png')).pipe(response); }
  const filePath = path.resolve(root, `.${pathname}`);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath)) { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SEC_HEADERS }); return response.end('Not found'); }
  response.writeHead(200, {
    'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    ...SEC_HEADERS
  });
  fs.createReadStream(filePath).pipe(response);
}).listen(port, '0.0.0.0', () => {
  console.log(`Slot host running on http://localhost:${port}`);
  console.log('[ADMIN PANEL] Password configured.');
});
