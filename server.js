'use strict';

/*
 * CHINA SOUTHERN AIRLINES VIRTUAL — CSN VIRTUAL
 * Backend Foundation
 * Motto: Fly towards your dreams - 飞向您的梦想
 *
 * Node.js + Express
 * Keep this file inside: ⚙️ Main files/server.js
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

// Sessions must never fall back to a predictable secret. If the
// configured value is missing or obviously weak, generate a strong
// random secret for this process and warn the operator loudly.
const SESSION_SECRET = (() => {
  const configured = process.env.SESSION_SECRET;

  if (configured && configured.length >= 32) {
    return configured;
  }

  if (configured) {
    console.warn(
      '[CSN SECURITY WARNING] SESSION_SECRET is too short or guessable. ' +
      'Set a long random value in .env and rotate it. Using a temporary secret for this run.'
    );
  } else {
    console.warn(
      '[CSN SECURITY WARNING] SESSION_SECRET is not set. Using a temporary secret for this run.'
    );
  }

  return crypto.randomBytes(48).toString('hex');
})();

app.disable('x-powered-by');

// Standard security headers. The content security policy deliberately
// allows the inline styles/scripts and CDN assets this site already uses,
// while locking down frame, base and object origins.
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        'https://cdn.jsdelivr.net'
      ],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Rate limiting: a generous general limit for normal use, plus a
// tighter limit on the authentication endpoints where abuse is likely.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please slow down.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Please try again later.' }
});

app.use('/api', apiLimiter);
app.use('/auth', authLimiter);

app.use(session({
  secret: SESSION_SECRET,
  name: 'csn.sid',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  }
}));

// --------------------------------------------------
// ERROR PAGE RENDERING
// --------------------------------------------------

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// API/fetch requests get JSON; browser navigations get a styled page.
function wantsJSON(req) {
  if (req.path.startsWith('/api/')) return true;

  const accept = String(req.get('accept') || '');

  return accept.includes('application/json') &&
    !accept.includes('text/html');
}

// A self-contained, on-brand error page so failures never fall
// through to an unstyled default response for browser visitors.
function renderErrorPage(res, statusCode, title, message) {
  const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#10243d">
<title>${escapeHtml(title)} | China Southern Airlines Virtual</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
:root{--blue:#0878d1;--blue-dark:#063b76;--navy:#10243d;--muted:#63748a;--border:rgba(12,76,135,.13);--radius:28px}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:40px 20px;
font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--navy);
background:radial-gradient(ellipse at 8% 8%,rgba(68,169,255,.13),transparent 32%),radial-gradient(ellipse at 92% 38%,rgba(0,111,210,.10),transparent 30%),linear-gradient(145deg,#fafdff,#edf7ff 48%,#fff);background-attachment:fixed}
.card{width:min(560px,100%);background:rgba(255,255,255,.72);border:1px solid var(--border);border-radius:var(--radius);
padding:46px 42px;text-align:center;box-shadow:0 22px 70px rgba(10,69,125,.13),inset 0 1px 0 rgba(255,255,255,.9);backdrop-filter:blur(18px)}
.code{display:inline-flex;align-items:center;gap:9px;color:var(--blue);font-size:.76rem;font-weight:850;letter-spacing:.14em;text-transform:uppercase}
.code:before{content:"";width:24px;height:3px;border-radius:9px;background:var(--blue)}
h1{margin:16px 0 12px;font-size:clamp(1.9rem,4vw,2.8rem);line-height:1.12;letter-spacing:-.035em}
p{margin:0 0 26px;color:var(--muted);line-height:1.7}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:12px 24px;border:1px solid transparent;
border-radius:999px;background:linear-gradient(135deg,#168fe8,#0754a0);color:#fff;font-weight:800;font-size:.92rem;text-decoration:none;
box-shadow:0 10px 25px rgba(8,120,209,.20),inset 0 1px 0 rgba(255,255,255,.32)}
.brand{margin-bottom:22px;font-weight:900;letter-spacing:-.02em}
.brand span{display:block;font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--blue)}
</style>
</head>
<body>
<div class="card">
<div class="brand">China Southern Airlines Virtual<span>CSN Virtual</span></div>
<div class="code">Error ${statusCode}</div>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
<a class="btn" href="/index.html">Return to homepage ↗</a>
</div>
</body>
</html>`;

  return res.status(statusCode).type('html').send(page);
}

// One place that decides JSON vs styled HTML for failures.
function fail(res, req, statusCode, title, message) {
  if (wantsJSON(req)) {
    return res.status(statusCode).json({ success: false, message });
  }

  return renderErrorPage(res, statusCode, title, message);
}

// --------------------------------------------------
// DISCORD OAUTH AUTHENTICATION
// --------------------------------------------------

app.get('/auth/discord', (req, res) => {
  if (
    !process.env.DISCORD_CLIENT_ID ||
    !process.env.DISCORD_REDIRECT_URI
  ) {
    return fail(
      res,
      req,
      503,
      'Discord login unavailable',
      'Discord login is not configured on this server yet. Please contact the CSN Virtual team.'
    );
  }

  const state = crypto.randomBytes(32).toString('hex');
  req.session.discordOAuthState = state;

  req.session.save(error => {
    if (error) {
      console.error('[DISCORD SESSION ERROR]', error.message);
      return res.status(500).send('Could not start Discord login.');
    }

    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      redirect_uri: process.env.DISCORD_REDIRECT_URI,
      response_type: 'code',
      scope: 'identify',
      state
    });

    return res.redirect(
      `https://discord.com/oauth2/authorize?${params.toString()}`
    );
  });
});

app.get('/auth/discord/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return fail(
        res,
        req,
        400,
        'Discord login cancelled',
        'You cancelled the Discord sign-in. You can try again whenever you are ready.'
      );
    }

    const expectedState = req.session.discordOAuthState;

    if (
      typeof code !== 'string' ||
      typeof state !== 'string' ||
      typeof expectedState !== 'string' ||
      state.length !== expectedState.length ||
      !crypto.timingSafeEqual(
        Buffer.from(state),
        Buffer.from(expectedState)
      )
    ) {
      return fail(
        res,
        req,
        400,
        'Login request expired',
        'This login request is invalid or has expired. Please start the sign-in again.'
      );
    }

    delete req.session.discordOAuthState;

    if (
      !process.env.DISCORD_CLIENT_ID ||
      !process.env.DISCORD_CLIENT_SECRET ||
      !process.env.DISCORD_REDIRECT_URI
    ) {
      return fail(
        res,
        req,
        503,
        'Discord login unavailable',
        'Discord login is not configured on this server yet. Please contact the CSN Virtual team.'
      );
    }

    const tokenResponse = await fetch(
      'https://discord.com/api/oauth2/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID,
          client_secret: process.env.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: process.env.DISCORD_REDIRECT_URI
        })
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error(
        '[DISCORD TOKEN ERROR]',
        tokenData.error || tokenResponse.status
      );

      return fail(
        res,
        req,
        502,
        'Sign-in could not be completed',
        'Discord could not complete the sign-in. Please try again.'
      );
    }

    const userResponse = await fetch(
      'https://discord.com/api/users/@me',
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    const discordUser = await userResponse.json();

    if (
      !userResponse.ok ||
      !discordUser.id ||
      !discordUser.username
    ) {
      return fail(
        res,
        req,
        502,
        'Profile unavailable',
        'Could not retrieve your Discord profile. Please try again.'
      );
    }

    // Derive and persist the member record server-side. The role is
    // never taken from the client; new members default to "member".
    upsertUserRecord({
      id: String(discordUser.id),
      username: cleanText(discordUser.username, 80),
      globalName: cleanText(discordUser.global_name, 80) || null,
      avatar: typeof discordUser.avatar === 'string' ? discordUser.avatar : null
    });

    req.session.regenerate(regenerateError => {
      if (regenerateError) {
        console.error(
          '[SESSION REGENERATE ERROR]',
          regenerateError.message
        );

        return fail(
          res,
          req,
          500,
          'Session error',
          'Could not create a secure login session. Please try again.'
        );
      }

      req.session.user = {
        id: String(discordUser.id),
        username: cleanText(discordUser.username, 80),
        globalName: cleanText(discordUser.global_name, 80) || null,
        avatar: typeof discordUser.avatar === 'string' ? discordUser.avatar : null
      };

      req.session.save(saveError => {
        if (saveError) {
          console.error('[SESSION SAVE ERROR]', saveError.message);

          return fail(
            res,
            req,
            500,
            'Session error',
            'Could not save your login session. Please try again.'
          );
        }

        return res.redirect('/profile.html');
      });
    });
  } catch (error) {
    console.error('[DISCORD LOGIN ERROR]', error.message);

    return fail(
      res,
      req,
      500,
      'Sign-in failed',
      'Discord login failed. Please try again.'
    );
  }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      loggedIn: false,
      user: null
    });
  }

  return res.json({
    loggedIn: true,
    user: req.session.user
  });
});

app.post('/auth/logout', (req, res) => {
  if (!req.session) {
    return res.json({ success: true });
  }

  req.session.destroy(error => {
    if (error) {
      console.error('[LOGOUT ERROR]', error.message);
      return sendError(res, 500, 'Could not sign out.');
    }

    res.clearCookie('csn.sid', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    return res.json({ success: true });
  });
});

const PORT = Number(process.env.PORT || 3000);

// Layout resolution.
//
// The project is authored with emoji-named folders ("🌐 HTML files/",
// "⚙️ Main files/", "CSN-V35data/", "audio/", "components/"). In some
// deployments the files sit flat alongside server.js instead. Resolve
// each directory by preference so both layouts work without edits.
const REPO_ROOT = path.basename(__dirname) === '⚙️ Main files'
  ? path.resolve(__dirname, '..')
  : __dirname;

function firstExistingDirectory(candidates, fallback) {
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch (_) {
      // Try the next candidate.
    }
  }

  return fallback;
}

const PATHS = Object.freeze({
  html: firstExistingDirectory(
    [path.join(REPO_ROOT, '🌐 HTML files')],
    REPO_ROOT
  ),
  javascript: firstExistingDirectory(
    [path.join(REPO_ROOT, '📜 JavaScript files')],
    REPO_ROOT
  ),
  components: firstExistingDirectory(
    [path.join(REPO_ROOT, 'components')],
    REPO_ROOT
  ),
  data: firstExistingDirectory(
    [path.join(REPO_ROOT, 'CSN-V35data')],
    REPO_ROOT
  ),
  audio: firstExistingDirectory(
    [path.join(REPO_ROOT, 'audio')],
    REPO_ROOT
  )
});

const DATA_FILES = Object.freeze({
  users: 'users.json',
  flights: 'flights.json',
  bookings: 'bookings.json',
  fleet: 'fleet.json',
  destinations: 'destinations.json',
  news: 'news.json',
  events: 'events.json',
  announcements: 'announcements.json',
  recruitment: 'recruitment.json',
  activity: 'activity.json',
  settings: 'settings.json'
});

const COLLECTION_FILES = new Set([
  DATA_FILES.users,
  DATA_FILES.flights,
  DATA_FILES.bookings,
  DATA_FILES.fleet,
  DATA_FILES.destinations,
  DATA_FILES.news,
  DATA_FILES.events,
  DATA_FILES.announcements,
  DATA_FILES.recruitment,
  DATA_FILES.activity
]);

// --------------------------------------------------
// 1. FOLDER AND DATA INITIALISATION
// --------------------------------------------------

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function defaultData(fileName) {
  return fileName === DATA_FILES.settings ? {} : [];
}

function dataPath(fileName) {
  if (!Object.values(DATA_FILES).includes(fileName)) {
    throw new Error(`Unrecognised data file: ${fileName}`);
  }

  return path.join(PATHS.data, fileName);
}

function ensureDataFile(fileName) {
  const filePath = dataPath(fileName);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      JSON.stringify(defaultData(fileName), null, 2) + '\n',
      { encoding: 'utf8', flag: 'wx' }
    );
  }

  return filePath;
}

function readJSON(fileName) {
  const filePath = ensureDataFile(fileName);

  try {
    const content = fs.readFileSync(filePath, 'utf8').trim();

    if (!content) {
      return defaultData(fileName);
    }

    const parsed = JSON.parse(content);

    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      (Array.isArray(parsed) && !COLLECTION_FILES.has(fileName)) ||
      (!Array.isArray(parsed) && fileName !== DATA_FILES.settings)
    ) {
      throw new Error('The JSON structure is not the expected type.');
    }

    return parsed;
  } catch (error) {
    console.error(`[DATA ERROR] ${fileName}: ${error.message}`);

    const dataError = new Error(
      `Cannot safely read ${fileName}. Check the file's JSON format.`
    );

    dataError.statusCode = 500;
    throw dataError;
  }
}

// Atomic replacement helps prevent a partially written JSON file if
// the process stops during a write.
function writeJSON(fileName, value) {
  const filePath = ensureDataFile(fileName);
  const temporaryPath = `${filePath}.${process.pid}.tmp`;

  const expectedArray = COLLECTION_FILES.has(fileName);

  if (expectedArray && !Array.isArray(value)) {
    throw new Error(`${fileName} must contain a JSON array.`);
  }

  if (
    fileName === DATA_FILES.settings &&
    (value === null || Array.isArray(value) || typeof value !== 'object')
  ) {
    throw new Error('settings.json must contain a JSON object.');
  }

  try {
    fs.writeFileSync(
      temporaryPath,
      JSON.stringify(value, null, 2) + '\n',
      'utf8'
    );

    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(temporaryPath)) {
        fs.unlinkSync(temporaryPath);
      }
    } catch (_) {
      // Preserve the original write error.
    }

    throw error;
  }
}

function initialiseData() {
  ensureDirectory(PATHS.data);
  ensureDirectory(PATHS.audio);

  for (const fileName of Object.values(DATA_FILES)) {
    ensureDataFile(fileName);
  }
}

initialiseData();

// --------------------------------------------------
// 2. GENERAL HELPERS
// --------------------------------------------------

function cleanText(value, maxLength = 200) {
  if (typeof value !== 'string') return '';

  return value.trim().slice(0, maxLength);
}

function normaliseReference(value) {
  return cleanText(value, 40).toUpperCase();
}

function makeSecureCode(length = 8) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(length);
  let result = '';

  for (let index = 0; index < length; index++) {
    result += alphabet[bytes[index] % alphabet.length];
  }

  return result;
}

function makeUniqueBookingReference(bookings) {
  let reference;

  do {
    reference = `CSN-${makeSecureCode(7)}`;
  } while (
    bookings.some(
      booking =>
        normaliseReference(booking.bookingReference) === reference
    )
  );

  return reference;
}

function findBookingIndex(bookings, reference) {
  const target = normaliseReference(reference);

  return bookings.findIndex(
    booking =>
      normaliseReference(booking.bookingReference) === target
  );
}

function sendError(res, statusCode, message) {
  return res.status(statusCode).json({
    success: false,
    message
  });
}

function publicBooking(booking) {
  if (!booking) return null;

  const {
    ticketToken,
    passengerCode,
    securityCode,
    qrPayload,
    ...safeBooking
  } = booking;

  return safeBooking;
}

// --------------------------------------------------
// 2b. MEMBER RECORDS
// --------------------------------------------------

const USER_ROLES = Object.freeze(['member', 'staff', 'admin']);

// Create or refresh the stored member record after a successful login.
// The role is decided here, on the server, and never taken from input.
function upsertUserRecord(profile) {
  try {
    const id = cleanText(profile.id, 40);

    if (!id) return null;

    const users = getCollection(DATA_FILES.users);
    const now = new Date().toISOString();
    const index = users.findIndex(
      user => user && cleanText(user.id, 40) === id
    );

    if (index === -1) {
      const record = {
        id,
        username: cleanText(profile.username, 80),
        globalName: cleanText(profile.globalName, 80) || null,
        avatar: typeof profile.avatar === 'string'
          ? cleanText(profile.avatar, 200)
          : null,
        role: 'member',
        level: 1,
        joinedSince: now,
        updatedAt: now
      };

      users.push(record);
      writeJSON(DATA_FILES.users, users);

      return record;
    }

    const existing = users[index];

    existing.username = cleanText(profile.username, 80) || existing.username;

    if (profile.globalName !== undefined) {
      existing.globalName = cleanText(profile.globalName, 80) || null;
    }

    if (profile.avatar !== undefined) {
      existing.avatar = typeof profile.avatar === 'string'
        ? cleanText(profile.avatar, 200)
        : null;
    }

    if (!USER_ROLES.includes(existing.role)) {
      existing.role = 'member';
    }

    existing.updatedAt = now;

    writeJSON(DATA_FILES.users, users);

    return existing;
  } catch (error) {
    console.error('[USER RECORD ERROR]', error.message);
    return null;
  }
}

// Role is always derived from the stored record, never from the client.
function deriveRole(discordId) {
  try {
    const users = getCollection(DATA_FILES.users);
    const record = users.find(
      user =>
        user &&
        cleanText(user.id, 40) === cleanText(discordId, 40)
    );

    return {
      role: record && USER_ROLES.includes(record.role)
        ? record.role
        : 'member',
      level: record && Number.isFinite(record.level) ? record.level : 1,
      record: record || null
    };
  } catch (error) {
    return { role: 'member', level: 1, record: null };
  }
}

// --------------------------------------------------
// 2c. INPUT SANITISING
// --------------------------------------------------

const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Recursively clean every stored string and drop dangerous keys.
function sanitiseInput(value, depth = 0) {
  if (depth > 6) return null;
  if (value === null) return null;
  if (typeof value === 'string') return cleanText(value, 4000);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value;

  if (Array.isArray(value)) {
    return value.slice(0, 200).map(entry => sanitiseInput(entry, depth + 1));
  }

  if (typeof value === 'object') {
    const output = {};

    for (const key of Object.keys(value)) {
      if (BLOCKED_KEYS.has(key) || key.startsWith('$')) continue;

      const cleanKey = cleanText(key, 80);
      if (!cleanKey) continue;

      output[cleanKey] = sanitiseInput(value[key], depth + 1);
    }

    return output;
  }

  return null;
}

// --------------------------------------------------
// 2d. DISCORD NOTIFICATIONS (NON-BLOCKING)
// --------------------------------------------------

// Fire-and-forget webhook notification. The HTTP response is never
// blocked on this call and the webhook URL is never logged.
function notifyDiscord(payload) {
  const webhook =
    process.env.DISCORD_WEBHOOK_URL ||
    process.env.CSN_DISCORD_WEBHOOK_URL;

  if (
    typeof webhook !== 'string' ||
    !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(webhook)
  ) {
    return;
  }

  const body = JSON.stringify({
    embeds: [{
      title: cleanText(payload.title, 240) || 'CSN Virtual',
      description: cleanText(payload.description, 1500),
      color: 0x0878d1,
      timestamp: new Date().toISOString(),
      fields: Array.isArray(payload.fields)
        ? payload.fields.slice(0, 10).map(field => ({
            name: cleanText(field.name, 120),
            value: cleanText(field.value, 300),
            inline: true
          }))
        : undefined
    }]
  });

  fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  })
    .then(response => {
      if (!response.ok) {
        console.error('[DISCORD NOTIFY] Webhook responded', response.status);
      }
    })
    .catch(error => {
      console.error('[DISCORD NOTIFY] Notification failed:', error.message);
    });
}
// --------------------------------------------------
// 3. SECURITY AND REQUEST PARSING
// --------------------------------------------------

app.use((req, res, next) => {
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({
  limit: '1mb',
  strict: true
}));

app.use(express.urlencoded({
  extended: false,
  limit: '1mb'
}));

// --------------------------------------------------
// 4. HEALTH CHECKS
// --------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'CSN Virtual API',
    airline: 'China Southern Airlines Virtual',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/audio-status', (req, res) => {
  const audioFile = path.join(PATHS.audio, 'boarding.mp3');

  res.json({
    success: true,
    boardingAudioAvailable: fs.existsSync(audioFile)
  });
});

// --------------------------------------------------
// 5. PUBLIC DATA HELPERS
// --------------------------------------------------

function getCollection(fileName) {
  const data = readJSON(fileName);
  return Array.isArray(data) ? data : [];
}

function getPublishedCollection(fileName) {
  return getCollection(fileName).filter(item => {
    if (!item || typeof item !== 'object') return false;

    // Entries without a publication field remain visible for
    // compatibility with existing JSON files.
    if (item.published === false) return false;
    if (item.status === 'draft') return false;
    if (item.status === 'private') return false;

    return true;
  });
}

function publicFlight(flight) {
  if (!flight || typeof flight !== 'object') return null;

  // Do not expose internal fields such as staff notes or private tokens.
  const {
    staffNotes,
    internalNotes,
    privateToken,
    ...safeFlight
  } = flight;

  return safeFlight;
}

// --------------------------------------------------
// 6. FLIGHTS
// --------------------------------------------------

app.get('/api/flights', (req, res, next) => {
  try {
    const flights = getPublishedCollection(DATA_FILES.flights)
      .map(publicFlight)
      .filter(Boolean);

    res.json({
      success: true,
      count: flights.length,
      flights
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 7. FLEET
// --------------------------------------------------

app.get('/api/fleet', (req, res, next) => {
  try {
    const fleet = getPublishedCollection(DATA_FILES.fleet);

    res.json({
      success: true,
      count: fleet.length,
      fleet
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 8. DESTINATIONS
// --------------------------------------------------

app.get('/api/destinations', (req, res, next) => {
  try {
    const destinations = getPublishedCollection(
      DATA_FILES.destinations
    );

    res.json({
      success: true,
      count: destinations.length,
      destinations
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 9. NEWS
// --------------------------------------------------

app.get('/api/news', (req, res, next) => {
  try {
    const news = getPublishedCollection(DATA_FILES.news);

    res.json({
      success: true,
      count: news.length,
      news
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 10. EVENTS
// --------------------------------------------------

app.get('/api/events', (req, res, next) => {
  try {
    const events = getPublishedCollection(DATA_FILES.events);

    res.json({
      success: true,
      count: events.length,
      events
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 11. ANNOUNCEMENTS
// --------------------------------------------------

app.get('/api/announcements', (req, res, next) => {
  try {
    const announcements = getPublishedCollection(
      DATA_FILES.announcements
    );

    res.json({
      success: true,
      count: announcements.length,
      announcements
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 12. RECRUITMENT
// --------------------------------------------------

app.get('/api/recruitment', (req, res, next) => {
  try {
    const recruitment = getPublishedCollection(
      DATA_FILES.recruitment
    );

    res.json({
      success: true,
      count: recruitment.length,
      recruitment
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 13. PUBLIC SETTINGS
// --------------------------------------------------

app.get('/api/settings/public', (req, res, next) => {
  try {
    const settings = readJSON(DATA_FILES.settings);

    // Only explicitly public fields are returned.
    // Keep secrets and internal configuration out of this response.
    const publicSettings = {
      airlineName: 'China Southern Airlines Virtual',
      airlineCode: 'CSN',
      slogan: 'Fly towards your dreams - 飞向您的梦想',
      hub: 'Guangzhou Baiyun International Airport',
      discordInvite: 'https://discord.gg/UuCc6bxXmG'
    };

    if (
      settings &&
      typeof settings.public === 'object' &&
      settings.public !== null &&
      !Array.isArray(settings.public)
    ) {
      Object.assign(publicSettings, settings.public);
    }

    res.json({
      success: true,
      settings: publicSettings
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 14. BOOKING SYSTEM HELPERS
// --------------------------------------------------

function getBookings() {
  const bookings = readJSON(DATA_FILES.bookings);

  if (!Array.isArray(bookings)) {
    throw new Error('The bookings database must be a JSON array.');
  }

  return bookings;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function normalisePassengers(passengers) {
  if (!Array.isArray(passengers) || passengers.length < 1 || passengers.length > 9) {
    return null;
  }

  const result = [];

  for (const passenger of passengers) {
    if (!passenger || typeof passenger !== 'object' || Array.isArray(passenger)) {
      return null;
    }

    const name = cleanText(passenger.name, 100);

    if (!name) return null;

    result.push({
      name,
      ...(cleanText(passenger.discordUsername, 80)
        ? { discordUsername: cleanText(passenger.discordUsername, 80) }
        : {}),
      ...(cleanText(passenger.robloxUsername, 80)
        ? { robloxUsername: cleanText(passenger.robloxUsername, 80) }
        : {})
    });
  }

  return result;
}

function safeBookingResponse(booking) {
  return {
    success: true,
    booking: publicBooking(booking)
  };
}// --------------------------------------------------
// 15. CREATE A BOOKING
// --------------------------------------------------

app.post('/api/bookings', (req, res, next) => {
  try {
    const body = req.body || {};

    const flightNumber = cleanText(body.flightNumber, 30);
    const origin = cleanText(body.origin, 100);
    const destination = cleanText(body.destination, 100);
    const departureDate = cleanText(body.departureDate, 10);
    const returnDate = cleanText(body.returnDate, 10);
    const tripType = cleanText(body.tripType, 20).toLowerCase();
    const passengers = normalisePassengers(body.passengers);

    if (!flightNumber || !origin || !destination || !departureDate) {
      return sendError(
        res,
        400,
        'Flight number, origin, destination and departure date are required.'
      );
    }

    if (origin.toLowerCase() === destination.toLowerCase()) {
      return sendError(
        res,
        400,
        'Origin and destination must be different.'
      );
    }

    if (!validDate(departureDate)) {
      return sendError(res, 400, 'The departure date is invalid.');
    }

    if (departureDate < new Date().toISOString().slice(0, 10)) {
      return sendError(res, 400, 'The departure date cannot be in the past.');
    }

    if (!passengers) {
      return sendError(
        res,
        400,
        'Provide between one and nine passengers, each with a name.'
      );
    }

    if (!['one-way', 'round-trip'].includes(tripType)) {
      return sendError(
        res,
        400,
        'Trip type must be one-way or round-trip.'
      );
    }

    if (tripType === 'round-trip') {
      if (!validDate(returnDate) || returnDate < departureDate) {
        return sendError(
          res,
          400,
          'A valid return date on or after departure is required.'
        );
      }
    }

    if (tripType === 'one-way' && returnDate) {
      return sendError(
        res,
        400,
        'A one-way booking must not include a return date.'
      );
    }

    const bookings = getBookings();
    const bookingReference = makeUniqueBookingReference(bookings);
    const passengerCode = makeSecureCode(8);
    const securityCode = makeSecureCode(8);
    const ticketToken = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();

    const sessionUser = req.session && req.session.user
      ? req.session.user
      : null;

    // Friend bookings require an explicit positive confirmation from
    // the friend. They are stored as "pending" and never auto-confirmed.
    const friendUsername = cleanText(body.friendDiscordUsername, 80);
    const wantsFriend = Boolean(body.friendBooking) && Boolean(friendUsername);

    let bookingStatus = 'confirmed';
    let requiresConfirmation = false;

    if (wantsFriend) {
      const ownUsername = sessionUser
        ? cleanText(sessionUser.username, 80).toLowerCase()
        : '';

      if (friendUsername.toLowerCase() !== ownUsername) {
        bookingStatus = 'pending';
        requiresConfirmation = true;
      }
    }

    const booking = {
      id: crypto.randomUUID(),
      bookingReference,
      passengerCode,
      securityCode,
      ticketToken,
      qrPayload: JSON.stringify({
        reference: bookingReference,
        token: ticketToken
      }),
      flightNumber,
      origin,
      destination,
      departureDate,
      returnDate: tripType === 'round-trip' ? returnDate : null,
      tripType,
      aircraft: cleanText(body.aircraft, 80),
      gate: cleanText(body.gate, 20),
      passengers,
      owner: sessionUser
        ? {
            discordId: cleanText(sessionUser.id, 40),
            username: cleanText(sessionUser.username, 80)
          }
        : null,
      bookedFor: wantsFriend
        ? { discordUsername: friendUsername }
        : null,
      status: bookingStatus,
      requiresConfirmation,
      confirmedAt: bookingStatus === 'confirmed' ? now : null,
      declinedAt: null,
      checkedIn: false,
      boarded: false,
      createdAt: now,
      updatedAt: now
    };

    bookings.push(booking);
    writeJSON(DATA_FILES.bookings, bookings);

    notifyDiscord({
      title: 'New CSN Virtual booking',
      description: `${bookingReference} · ${origin} → ${destination}`,
      fields: [
        { name: 'Flight', value: flightNumber },
        { name: 'Status', value: bookingStatus }
      ]
    });

    // Ticket secrets are returned only to the person creating
    // this booking. Never include them in public booking lists.
    return res.status(201).json({
      success: true,
      message: requiresConfirmation
        ? 'Booking created. It is pending your friend\'s confirmation.'
        : 'Booking created successfully.',
      requiresConfirmation,
      booking
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 16. PRIVATE BOOKING LOOKUP
// --------------------------------------------------

app.get('/api/bookings/:reference', (req, res, next) => {
  try {
    const reference = normaliseReference(req.params.reference);
    const passengerCode = cleanText(req.query.passengerCode, 40);
    const securityCode = cleanText(req.query.securityCode, 40);

    if (!reference || !passengerCode || !securityCode) {
      return sendError(
        res,
        401,
        'Booking reference, passenger code and security code are required.'
      );
    }

    const bookings = getBookings();
    const index = findBookingIndex(bookings, reference);

    if (index === -1) {
      return sendError(res, 404, 'Booking not found.');
    }

    const booking = bookings[index];

    const passengerMatches =
      typeof booking.passengerCode === 'string' &&
      booking.passengerCode === passengerCode;

    const securityMatches =
      typeof booking.securityCode === 'string' &&
      booking.securityCode === securityCode;

    if (!passengerMatches || !securityMatches) {
      return sendError(res, 403, 'The booking access codes are incorrect.');
    }

    return res.json(safeBookingResponse(booking));
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 17. SAFE BOOKING LIST
// --------------------------------------------------

app.get('/api/bookings', (req, res, next) => {
  try {
    // This endpoint deliberately does not expose passenger names,
    // access codes, ticket tokens, QR payloads or member Discord
    // details. It is a minimal operational summary only.
    const bookings = getBookings().map(booking => {
      const safe = publicBooking(booking);

      if (!safe || typeof safe !== 'object') return null;

      const passengerCount = Array.isArray(safe.passengers)
        ? safe.passengers.length
        : 0;

      return {
        bookingReference: safe.bookingReference,
        flightNumber: safe.flightNumber,
        origin: safe.origin,
        destination: safe.destination,
        departureDate: safe.departureDate,
        returnDate: safe.returnDate || null,
        tripType: safe.tripType,
        status: safe.status,
        checkedIn: Boolean(safe.checkedIn),
        boarded: Boolean(safe.boarded),
        passengerCount,
        createdAt: safe.createdAt
      };
    }).filter(Boolean);

    res.json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 17b. FRIEND BOOKING CONFIRMATION
// --------------------------------------------------

function locateBooking(reference) {
  const bookings = getBookings();
  const index = findBookingIndex(bookings, reference);

  if (index === -1) return { bookings, index: -1, booking: null };

  return { bookings, index, booking: bookings[index] };
}

function accessCodesMatch(booking, passengerCode, securityCode) {
  return (
    typeof booking.passengerCode === 'string' &&
    booking.passengerCode === passengerCode &&
    typeof booking.securityCode === 'string' &&
    booking.securityCode === securityCode
  );
}

// The friend (or the booker) must explicitly confirm a pending booking.
app.post('/api/bookings/:reference/confirm', (req, res, next) => {
  try {
    const body = req.body || {};
    const reference = normaliseReference(req.params.reference);
    const passengerCode = cleanText(body.passengerCode, 40);
    const securityCode = cleanText(body.securityCode, 40);

    if (!reference || !passengerCode || !securityCode) {
      return sendError(
        res,
        400,
        'Booking reference, passenger code and security code are required.'
      );
    }

    const { bookings, index, booking } = locateBooking(reference);

    if (index === -1) {
      return sendError(res, 404, 'Booking not found.');
    }

    if (!accessCodesMatch(booking, passengerCode, securityCode)) {
      return sendError(res, 403, 'The booking access codes are incorrect.');
    }

    if (booking.status === 'confirmed') {
      return sendError(res, 409, 'This booking is already confirmed.');
    }

    if (booking.status !== 'pending') {
      return sendError(
        res,
        409,
        'Only a pending booking can be confirmed.'
      );
    }

    booking.status = 'confirmed';
    booking.requiresConfirmation = false;
    booking.confirmedAt = new Date().toISOString();
    booking.updatedAt = booking.confirmedAt;

    writeJSON(DATA_FILES.bookings, bookings);

    notifyDiscord({
      title: 'Booking confirmed',
      description: `${booking.bookingReference} is now confirmed.`,
      fields: [{ name: 'Status', value: 'confirmed' }]
    });

    return res.json({
      success: true,
      message: 'Booking confirmed.',
      booking: publicBooking(booking)
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/bookings/:reference/decline', (req, res, next) => {
  try {
    const body = req.body || {};
    const reference = normaliseReference(req.params.reference);
    const passengerCode = cleanText(body.passengerCode, 40);
    const securityCode = cleanText(body.securityCode, 40);

    if (!reference || !passengerCode || !securityCode) {
      return sendError(
        res,
        400,
        'Booking reference, passenger code and security code are required.'
      );
    }

    const { bookings, index, booking } = locateBooking(reference);

    if (index === -1) {
      return sendError(res, 404, 'Booking not found.');
    }

    if (!accessCodesMatch(booking, passengerCode, securityCode)) {
      return sendError(res, 403, 'The booking access codes are incorrect.');
    }

    if (booking.status !== 'pending') {
      return sendError(
        res,
        409,
        'Only a pending booking can be declined.'
      );
    }

    booking.status = 'declined';
    booking.requiresConfirmation = false;
    booking.declinedAt = new Date().toISOString();
    booking.updatedAt = booking.declinedAt;

    writeJSON(DATA_FILES.bookings, bookings);

    notifyDiscord({
      title: 'Booking declined',
      description: `${booking.bookingReference} was declined.`,
      fields: [{ name: 'Status', value: 'declined' }]
    });

    return res.json({
      success: true,
      message: 'Booking declined.',
      booking: publicBooking(booking)
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 17c. MEMBER-SCOPED ENDPOINTS
// --------------------------------------------------

app.get('/api/my-bookings', (req, res, next) => {
  try {
    if (!req.session || !req.session.user) {
      return sendError(res, 401, 'Please sign in to view your bookings.');
    }

    const id = cleanText(req.session.user.id, 40);

    const bookings = getBookings()
      .filter(
        booking =>
          booking &&
          booking.owner &&
          cleanText(booking.owner.discordId, 40) === id
      )
      .map(publicBooking);

    return res.json({
      success: true,
      count: bookings.length,
      bookings
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/profile', (req, res, next) => {
  try {
    if (!req.session || !req.session.user) {
      return sendError(res, 401, 'Please sign in to view your profile.');
    }

    const { role, level } = deriveRole(req.session.user.id);

    return res.json({
      success: true,
      profile: {
        id: cleanText(req.session.user.id, 40),
        username: cleanText(req.session.user.username, 80),
        globalName: cleanText(req.session.user.globalName, 80) || null,
        avatar: req.session.user.avatar || null,
        role,
        level
      }
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 17d. ADMIN CONTENT MANAGEMENT
// --------------------------------------------------

const ADMIN_COLLECTIONS = Object.freeze({
  flights: DATA_FILES.flights,
  fleet: DATA_FILES.fleet,
  destinations: DATA_FILES.destinations,
  news: DATA_FILES.news,
  announcements: DATA_FILES.announcements,
  recruitment: DATA_FILES.recruitment
});

function adminCollectionFile(name) {
  return Object.prototype.hasOwnProperty.call(ADMIN_COLLECTIONS, name)
    ? ADMIN_COLLECTIONS[name]
    : null;
}

// Settings routes are declared before the :collection route so that
// "/api/admin/settings" is not mistaken for a collection named "settings".
app.get('/api/admin/settings', (req, res, next) => {
  try {
    if (!requireStaffKey(req, res)) return;

    return res.json({ success: true, settings: readJSON(DATA_FILES.settings) });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/settings', (req, res, next) => {
  try {
    if (!requireStaffKey(req, res)) return;

    const cleaned = sanitiseInput(req.body || {});

    if (!cleaned || typeof cleaned !== 'object' || Array.isArray(cleaned)) {
      return sendError(res, 400, 'A valid JSON object is required.');
    }

    const current = readJSON(DATA_FILES.settings);
    const next = { ...current, ...cleaned };

    writeJSON(DATA_FILES.settings, next);

    return res.json({ success: true, settings: next });
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/:collection', (req, res, next) => {
  try {
    if (!requireStaffKey(req, res)) return;

    const file = adminCollectionFile(req.params.collection);

    if (!file) return sendError(res, 404, 'Unknown collection.');

    const items = getCollection(file);

    return res.json({ success: true, count: items.length, items });
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/:collection', (req, res, next) => {
  try {
    if (!requireStaffKey(req, res)) return;

    const file = adminCollectionFile(req.params.collection);

    if (!file) return sendError(res, 404, 'Unknown collection.');

    const cleaned = sanitiseInput(req.body || {});

    if (!cleaned || typeof cleaned !== 'object' || Array.isArray(cleaned)) {
      return sendError(res, 400, 'A valid JSON object is required.');
    }

    const items = getCollection(file);
    const now = new Date().toISOString();

    const record = {
      ...cleaned,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };

    items.push(record);
    writeJSON(file, items);

    return res.status(201).json({ success: true, item: record });
  } catch (error) {
    next(error);
  }
});

app.put('/api/admin/:collection/:id', (req, res, next) => {
  try {
    if (!requireStaffKey(req, res)) return;

    const file = adminCollectionFile(req.params.collection);

    if (!file) return sendError(res, 404, 'Unknown collection.');

    const id = cleanText(req.params.id, 80);
    const items = getCollection(file);
    const index = items.findIndex(
      item => item && cleanText(item.id, 80) === id
    );

    if (index === -1) return sendError(res, 404, 'Record not found.');

    const cleaned = sanitiseInput(req.body || {});

    if (!cleaned || typeof cleaned !== 'object' || Array.isArray(cleaned)) {
      return sendError(res, 400, 'A valid JSON object is required.');
    }

    delete cleaned.id;
    delete cleaned.createdAt;

    items[index] = {
      ...items[index],
      ...cleaned,
      id: items[index].id,
      createdAt: items[index].createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    writeJSON(file, items);

    return res.json({ success: true, item: items[index] });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/admin/:collection/:id', (req, res, next) => {
  try {
    if (!requireStaffKey(req, res)) return;

    const file = adminCollectionFile(req.params.collection);

    if (!file) return sendError(res, 404, 'Unknown collection.');

    const id = cleanText(req.params.id, 80);
    const items = getCollection(file);
    const index = items.findIndex(
      item => item && cleanText(item.id, 80) === id
    );

    if (index === -1) return sendError(res, 404, 'Record not found.');

    const [removed] = items.splice(index, 1);
    writeJSON(file, items);

    return res.json({ success: true, removedId: removed.id });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 18. STAFF AUTHENTICATION HELPER
// --------------------------------------------------

function staffKeyMatches(providedKey, expectedKey) {
  if (typeof providedKey !== 'string' || typeof expectedKey !== 'string') {
    return false;
  }

  const provided = Buffer.from(providedKey);
  const expected = Buffer.from(expectedKey);

  if (provided.length !== expected.length || expected.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}

function requireStaffKey(req, res) {
  const expectedKey = process.env.CSN_STAFF_API_KEY;
  const providedKey = req.get('x-csn-staff-key');

  if (!expectedKey) {
    sendError(
      res,
      503,
      'Staff operations are not configured on this server.'
    );

    return false;
  }

  if (!staffKeyMatches(providedKey, expectedKey)) {
    sendError(res, 403, 'Staff authorisation is required.');
    return false;
  }

  return true;
}

// Constant-time compare for secrets, tokens and codes.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;

  const provided = Buffer.from(a);
  const expected = Buffer.from(b);

  if (provided.length !== expected.length || expected.length === 0) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}

// --------------------------------------------------
// 19. VERIFY A TICKET
// --------------------------------------------------

app.post('/api/tickets/verify', (req, res, next) => {
  try {
    if (!requireStaffKey(req, res)) return;

    const body = req.body || {};
    const reference = normaliseReference(body.bookingReference);
    const passengerCode = cleanText(body.passengerCode, 40);
    const securityCode = cleanText(body.securityCode, 40);
    const ticketToken = cleanText(body.ticketToken, 100);

    if (!reference || !passengerCode || !securityCode || !ticketToken) {
      return sendError(
        res,
        400,
        'Booking reference, passenger code, security code and ticket token are required.'
      );
    }

    const bookings = getBookings();

    const booking = bookings.find(item =>
      normaliseReference(item.bookingReference) === reference
    );

    if (!booking) {
      return sendError(res, 404, 'Ticket or booking not found.');
    }

    if (
      !safeEqual(booking.passengerCode, passengerCode) ||
      !safeEqual(booking.securityCode, securityCode) ||
      !safeEqual(booking.ticketToken, ticketToken)
    ) {
      return sendError(res, 403, 'Ticket verification failed.');
    }

    if (booking.status !== 'confirmed') {
      return sendError(res, 409, 'This booking is not confirmed.');
    }

    return res.json({
      success: true,
      valid: true,
      booking: publicBooking(booking)
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 20. STAFF CHECK-IN
// --------------------------------------------------

app.post('/api/tickets/check-in', (req, res, next) => {
  try {
    if (!requireStaffKey(req, res)) return;

    const body = req.body || {};
    const reference = normaliseReference(body.bookingReference);

    if (!reference) {
      return sendError(res, 400, 'A booking reference is required.');
    }

    const bookings = getBookings();
    const index = findBookingIndex(bookings, reference);

    if (index === -1) {
      return sendError(res, 404, 'Booking not found.');
    }

    const booking = bookings[index];

    if (booking.status !== 'confirmed') {
      return sendError(res, 409, 'This booking is not confirmed.');
    }

    if (booking.checkedIn) {
      return sendError(res, 409, 'This passenger is already checked in.');
    }

    booking.checkedIn = true;
    booking.checkedInAt = new Date().toISOString();
    booking.updatedAt = booking.checkedInAt;

    writeJSON(DATA_FILES.bookings, bookings);

    return res.json({
      success: true,
      message: 'Passenger checked in successfully.',
      booking: publicBooking(booking)
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 21. STAFF BOARDING
// --------------------------------------------------

app.post('/api/tickets/board', (req, res, next) => {
  try {
    if (!requireStaffKey(req, res)) return;

    const body = req.body || {};
    const reference = normaliseReference(body.bookingReference);

    if (!reference) {
      return sendError(res, 400, 'A booking reference is required.');
    }

    const bookings = getBookings();
    const index = findBookingIndex(bookings, reference);

    if (index === -1) {
      return sendError(res, 404, 'Booking not found.');
    }

    const booking = bookings[index];

    if (booking.status !== 'confirmed') {
      return sendError(res, 409, 'This booking is not confirmed.');
    }

    if (!booking.checkedIn) {
      return sendError(
        res,
        409,
        'The passenger must check in before boarding.'
      );
    }

    if (booking.boarded) {
      return sendError(res, 409, 'This passenger has already boarded.');
    }

    booking.boarded = true;
    booking.boardedAt = new Date().toISOString();
    booking.updatedAt = booking.boardedAt;

    writeJSON(DATA_FILES.bookings, bookings);

    return res.json({
      success: true,
      message: 'Passenger boarded successfully.',
      booking: publicBooking(booking)
    });
  } catch (error) {
    next(error);
  }
});

// --------------------------------------------------
// 22. STATIC WEBSITE FILES
// --------------------------------------------------

// Do not expose the private data directory or server source files.
// When the project runs in a flat layout the static root is the repo
// root itself, so sensitive names must be blocked explicitly.
const PRIVATE_DATA_SEGMENT = path
  .basename(PATHS.data)
  .toLowerCase();

const SENSITIVE_ROOT_FILES = new Set([
  'server.js',
  'bot.js',
  'bot-config.js',
  'package.json',
  'package-lock.json'
]);

app.use((req, res, next) => {
  let decoded = req.path;

  try {
    decoded = decodeURIComponent(req.path);
  } catch (_) {
    // Leave the raw path in place if it cannot be decoded.
  }

  const lower = decoded.toLowerCase();
  const segments = lower.split('/').filter(Boolean);

  const blocked =
    lower.startsWith(`/${PRIVATE_DATA_SEGMENT}`) ||
    lower.startsWith('/node_modules') ||
    lower.startsWith('/.git') ||
    (segments.length === 1 &&
      (SENSITIVE_ROOT_FILES.has(segments[0]) ||
        segments[0].endsWith('.json')));

  if (blocked) {
    return fail(
      res,
      req,
      404,
      'Page not found',
      'The page you requested could not be found.'
    );
  }

  return next();
});

// Do not expose the private data directory.
app.use(express.static(PATHS.html, {
  index: false,
  dotfiles: 'deny'
}));

// Serve shared JavaScript and components through their own URLs.
app.use('/javascript', express.static(PATHS.javascript, {
  index: false,
  dotfiles: 'deny'
}));

app.use('/components', express.static(PATHS.components, {
  index: false,
  dotfiles: 'deny'
}));

// Boarding audio is available as a file, but the frontend should
// only start playback after the visitor selects START EXPERIENCE.
app.get('/audio/boarding.mp3', (req, res) => {
  const audioFile = path.join(PATHS.audio, 'boarding.mp3');

  if (!fs.existsSync(audioFile)) {
    return sendError(res, 404, 'Boarding audio is not available.');
  }

  return res.sendFile(audioFile);
});

// --------------------------------------------------
// 23. WEBSITE PAGE ROUTES
// --------------------------------------------------

const PAGE_ROUTES = Object.freeze({
  '/': 'index.html',
  '/index': 'index.html',
  '/index.html': 'index.html',
  '/about': 'about.html',
  '/about.html': 'about.html',
  '/booking': 'booking.html',
  '/booking.html': 'booking.html',
  '/booking-confirmation': 'booking-confirmation.html',
  '/booking-confirmation.html': 'booking-confirmation.html',
  '/my-bookings': 'my-bookings.html',
  '/my-bookings.html': 'my-bookings.html',
  '/flights': 'flights.html',
  '/flights.html': 'flights.html',
  '/fleet': 'fleet.html',
  '/fleet.html': 'fleet.html',
  '/destinations': 'destinations.html',
  '/destinations.html': 'destinations.html',
  '/recruitment': 'recruitment.html',
  '/recruitment.html': 'recruitment.html',
  '/community': 'community.html',
  '/community.html': 'community.html',
  '/news': 'news.html',
  '/news.html': 'news.html',
  '/login': 'login.html',
  '/login.html': 'login.html',
  // The navigation links intentionally use a capital "Login.html".
  // Linux file systems are case sensitive, so this alias keeps the
  // existing markup working without editing every page.
  '/Login.html': 'login.html',
  '/profile': 'profile.html',
  '/profile.html': 'profile.html',
  '/staff-login': 'staff-login.html',
  '/staff-login.html': 'staff-login.html',
  '/staff': 'staff.html',
  '/staff.html': 'staff.html',
  '/admin-login': 'admin-login.html',
  '/admin-login.html': 'admin-login.html',
  '/admin': 'admin.html',
  '/admin.html': 'admin.html',
  '/error': 'error.html',
  '/error.html': 'error.html',
  '/404': '404.html',
  '/404.html': '404.html'
});

for (const [route, fileName] of Object.entries(PAGE_ROUTES)) {
  app.get(route, (req, res, next) => {
    const pagePath = path.join(PATHS.html, fileName);

    if (!fs.existsSync(pagePath)) {
      return fail(
        res,
        req,
        404,
        'Page not found',
        'The page you requested is not available. It may have been moved or renamed.'
      );
    }

    return res.sendFile(pagePath, error => {
      if (error && !res.headersSent) {
        next(error);
      }
    });
  });
}

// --------------------------------------------------
// 24. UNKNOWN API ROUTES
// --------------------------------------------------

app.use('/api', (req, res) => {
  return sendError(res, 404, 'API endpoint not found.');
});

// --------------------------------------------------
// 25. UNKNOWN WEBSITE ROUTES
// --------------------------------------------------

app.use((req, res) => {
  return fail(
    res,
    req,
    404,
    'Page not found',
    'The page you requested could not be found. Check the address or return to the homepage.'
  );
});

// --------------------------------------------------
// 26. CENTRAL ERROR HANDLER
// --------------------------------------------------

app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  console.error('[CSN SERVER ERROR]', {
    method: req.method,
    path: req.path,
    message: error.message
  });

  if (error.type === 'entity.parse.failed') {
    return fail(
      res,
      req,
      400,
      'Invalid request',
      'The request contained invalid data. Please check your details and try again.'
    );
  }

  if (error.type === 'entity.too.large') {
    return fail(
      res,
      req,
      413,
      'Request too large',
      'The data you submitted is too large. Please reduce it and try again.'
    );
  }

  const statusCode =
    Number.isInteger(error.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode <= 599
      ? error.statusCode
      : 500;

  const message =
    statusCode === 500
      ? 'An internal server error occurred. Please try again shortly.'
      : error.message;

  // Browser navigations receive the styled page; API calls receive JSON.
  return fail(
    res,
    req,
    statusCode,
    statusCode === 404 ? 'Page not found' : 'Something went wrong',
    message
  );
});

// --------------------------------------------------
// 27. START SERVER
// --------------------------------------------------

const server = app.listen(PORT, () => {
  console.log('');
  console.log('==========================================');
  console.log('  CHINA SOUTHERN AIRLINES VIRTUAL');
  console.log('  CSN VIRTUAL SERVER');
  console.log('==========================================');
  console.log(`  Status: ONLINE`);
  console.log(`  Local URL: http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
  console.log(`  Flights: http://localhost:${PORT}/api/flights`);
  console.log(`  Fleet: http://localhost:${PORT}/api/fleet`);
  console.log(`  Destinations: http://localhost:${PORT}/api/destinations`);
  console.log('==========================================');
  console.log('');
});

server.on('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Stop the other server or choose another port.`
    );
  } else {
    console.error('[CSN SERVER STARTUP ERROR]', error);
  }
});

function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down CSN Virtual...`);

  server.close(error => {
    if (error) {
      console.error('[CSN SHUTDOWN ERROR]', error);
      process.exitCode = 1;
      return;
    }

    console.log('CSN Virtual server stopped safely.');
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));