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

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
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
// DISCORD OAUTH AUTHENTICATION
// --------------------------------------------------

app.get('/auth/discord', (req, res) => {
  if (
    !process.env.DISCORD_CLIENT_ID ||
    !process.env.DISCORD_REDIRECT_URI
  ) {
    return res.status(503).send(
      'Discord login is not configured. Check your .env file.'
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
      return res.status(400).send('Discord login was cancelled.');
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
      return res.status(400).send(
        'Invalid or expired login request. Please try again.'
      );
    }

    delete req.session.discordOAuthState;

    if (
      !process.env.DISCORD_CLIENT_ID ||
      !process.env.DISCORD_CLIENT_SECRET ||
      !process.env.DISCORD_REDIRECT_URI
    ) {
      return res.status(503).send(
        'Discord login is not configured. Check your .env file.'
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

      return res.status(502).send(
        'Discord could not complete sign-in. Please try again.'
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
      return res.status(502).send(
        'Could not retrieve your Discord profile.'
      );
    }

    req.session.regenerate(regenerateError => {
      if (regenerateError) {
        console.error(
          '[SESSION REGENERATE ERROR]',
          regenerateError.message
        );

        return res.status(500).send(
          'Could not create a secure login session.'
        );
      }

      req.session.user = {
        id: discordUser.id,
        username: discordUser.username,
        globalName: discordUser.global_name || null,
        avatar: discordUser.avatar || null
      };

      req.session.save(saveError => {
        if (saveError) {
          console.error('[SESSION SAVE ERROR]', saveError.message);

          return res.status(500).send(
            'Could not save your login session.'
          );
        }

        return res.redirect('/index.html');
      });
    });
  } catch (error) {
    console.error('[DISCORD LOGIN ERROR]', error.message);

    return res.status(500).send(
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

    res.clearCookie('connect.sid', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    return res.json({ success: true });
  });
});

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = path.resolve(__dirname, '..');

const PATHS = Object.freeze({
  html: path.join(ROOT_DIR, '🌐 HTML files'),
  javascript: path.join(ROOT_DIR, '📜 JavaScript files'),
  components: path.join(ROOT_DIR, 'components'),
  data: path.join(ROOT_DIR, 'CSN-V35data'),
  audio: path.join(ROOT_DIR, 'audio')
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
}// --------------------------------------------------
// 3. SECURITY AND REQUEST PARSING
// --------------------------------------------------

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');

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
      status: 'confirmed',
      checkedIn: false,
      boarded: false,
      createdAt: now,
      updatedAt: now
    };

    bookings.push(booking);
    writeJSON(DATA_FILES.bookings, bookings);

    // Ticket secrets are returned only to the person creating
    // this booking. Never include them in public booking lists.
    return res.status(201).json({
      success: true,
      message: 'Booking created successfully.',
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

    return safeBookingResponse(booking);
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
    // access codes, ticket tokens or QR payloads.
    // A real staff-only list must be added after staff authentication
    // is connected to the frontend.
    const bookings = getBookings().map(booking => {
      const safe = publicBooking(booking);

      if (safe && Array.isArray(safe.passengers)) {
        safe.passengerCount = safe.passengers.length;
        delete safe.passengers;
      }

      return safe;
    });

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

// --------------------------------------------------
// 19. VERIFY A TICKET
// --------------------------------------------------

app.post('/api/tickets/verify', (req, res, next) => {
  try {
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
      booking.passengerCode !== passengerCode ||
      booking.securityCode !== securityCode ||
      booking.ticketToken !== ticketToken
    ) {
      return sendError(res, 403, 'Ticket verification failed.');
    }

    if (booking.status !== 'confirmed') {
      return sendError(res, 409, 'This booking is not confirmed.');
    }

    return res.json({
      success: true,
      valid: true,
      ticket: publicBooking(booking)
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
  '/booking': 'booking.html',
  '/booking-confirmation': 'booking-confirmation.html',
  '/my-bookings': 'my-bookings.html',
  '/flights': 'flights.html',
  '/fleet': 'fleet.html',
  '/destinations': 'destinations.html',
  '/recruitment': 'recruitment.html',
  '/news': 'news.html',
  '/about': 'about.html',
  '/login': 'login.html',
  '/profile': 'profile.html',
  '/staff-login': 'staff-login.html',
  '/staff': 'staff.html',
  '/admin-login': 'admin-login.html',
  '/admin': 'admin.html'
});

for (const [route, fileName] of Object.entries(PAGE_ROUTES)) {
  app.get(route, (req, res, next) => {
    const pagePath = path.join(PATHS.html, fileName);

    if (!fs.existsSync(pagePath)) {
      return res.status(404).send(
        'This page is not available yet. Please check the page filename.'
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
  return res.status(404).send('Page not found.');
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
    return sendError(res, 400, 'The request contains invalid JSON.');
  }

  if (error.type === 'entity.too.large') {
    return sendError(res, 413, 'The request is too large.');
  }

  const statusCode =
    Number.isInteger(error.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode <= 599
      ? error.statusCode
      : 500;

  const message =
    statusCode === 500
      ? 'An internal server error occurred.'
      : error.message;

  return sendError(res, statusCode, message);
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