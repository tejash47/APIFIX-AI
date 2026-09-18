const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.resolve(__dirname, '../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const RESET_SESSIONS_FILE = path.join(DATA_DIR, 'reset_sessions.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {
    console.error('Failed to create data directory:', e);
  }
}

const defaultHashedPassword = bcrypt.hashSync('password456', 10);

const SEED_USERS = [
  {
    id: 'usr_admin_0000_sys',
    email: 'admin@apifix.ai',
    name: 'System Administrator',
    phone: '+1 800 555 0100',
    password: defaultHashedPassword,
    role: 'admin',
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr_dev_0100_lead',
    email: 'dev@apifix.ai',
    name: 'Lead Reliability Engineer',
    phone: '+1 800 555 0199',
    password: defaultHashedPassword,
    role: 'developer',
    createdAt: new Date().toISOString()
  }
];

function loadUsersFromDisk() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('[UserStore] Error reading users.json from disk:', err);
  }
  saveUsersToDisk(SEED_USERS);
  return [...SEED_USERS];
}

function saveUsersToDisk(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.error('[UserStore] Error writing users.json to disk:', err);
  }
}

function loadResetSessions() {
  try {
    if (fs.existsSync(RESET_SESSIONS_FILE)) {
      const raw = fs.readFileSync(RESET_SESSIONS_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('[UserStore] Error reading reset_sessions.json:', err);
  }
  return [];
}

function saveResetSessions(sessions) {
  try {
    fs.writeFileSync(RESET_SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
  } catch (err) {
    console.error('[UserStore] Error writing reset_sessions.json:', err);
  }
}

let cachedUsers = loadUsersFromDisk();

function getAllUsers() {
  cachedUsers = loadUsersFromDisk();
  return cachedUsers;
}

/**
 * Normalizes phone numbers by stripping spaces, dashes, parentheses and non-numeric chars
 */
function normalizePhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  return phone.replace(/[^0-9]/g, '');
}

/**
 * Generates structured User ID from user name, phone number, and a random slug
 * Format: usr_{nameSlug}_{phoneLast4}_{randHex}
 */
function generateCustomUserId(name = '', phone = '') {
  const cleanName = (name || 'dev')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 12) || 'user';

  const digits = normalizePhone(phone);
  const phoneSuffix = digits.length >= 4 ? digits.slice(-4) : (digits || '0000');
  const rand = crypto.randomBytes(2).toString('hex'); // 4-char hex

  return `usr_${cleanName}_${phoneSuffix}_${rand}`;
}

function findUserByEmail(email) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const users = getAllUsers();
  return users.find(u => u.email && u.email.toLowerCase() === normalized) || null;
}

function findUserById(id) {
  if (!id) return null;
  const users = getAllUsers();
  return users.find(u => u.id === id) || null;
}

function findUserByPhone(phone) {
  if (!phone) return null;
  const targetDigits = normalizePhone(phone);
  if (!targetDigits) return null;
  const users = getAllUsers();
  return users.find(u => u.phone && normalizePhone(u.phone) === targetDigits) || null;
}

function findUserByName(name) {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  const users = getAllUsers();
  return users.find(u => u.name && u.name.trim().toLowerCase() === normalized) || null;
}

/**
 * Flexible identifier lookup: Matches User ID, Email, Phone Number, or Name
 */
function findUserByIdentifier(identifier) {
  if (!identifier || typeof identifier !== 'string') return null;
  const raw = identifier.trim();
  if (!raw) return null;

  // 1. Direct ID match
  const byId = findUserById(raw);
  if (byId) return byId;

  // 2. Email match
  if (raw.includes('@')) {
    const byEmail = findUserByEmail(raw);
    if (byEmail) return byEmail;
  }

  // 3. Phone match (if contains numeric digits)
  const phoneDigits = normalizePhone(raw);
  if (phoneDigits.length >= 7) {
    const byPhone = findUserByPhone(raw);
    if (byPhone) return byPhone;
  }

  // 4. Exact Email match (without '@' check fallback)
  const byEmail = findUserByEmail(raw);
  if (byEmail) return byEmail;

  // 5. Name match
  const byName = findUserByName(raw);
  if (byName) return byName;

  return null;
}

/**
 * Creates a new user record with generated Custom ID
 */
function createUser(userData) {
  const users = getAllUsers();
  const normalizedEmail = (userData.email || '').trim().toLowerCase();
  
  if (normalizedEmail) {
    const existingEmail = users.find(u => u.email && u.email.toLowerCase() === normalizedEmail);
    if (existingEmail) {
      throw new Error('An account with this email already exists');
    }
  }

  const phone = (userData.phone || '').trim();
  if (phone) {
    const existingPhone = findUserByPhone(phone);
    if (existingPhone) {
      throw new Error('An account with this phone number already exists');
    }
  }

  const displayName = userData.name ? userData.name.trim() : (normalizedEmail ? normalizedEmail.split('@')[0] : 'Developer');
  const userId = userData.id || generateCustomUserId(displayName, phone);

  const newUser = {
    id: userId,
    email: normalizedEmail,
    name: displayName,
    phone: phone || null,
    password: userData.password,
    role: userData.role || 'developer',
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsersToDisk(users);
  cachedUsers = users;
  return newUser;
}

/**
 * Updates a user's password
 */
function updateUserPassword(userId, newHashedPassword) {
  const users = getAllUsers();
  const idx = users.findIndex(u => u.id === userId);
  if (idx === -1) {
    throw new Error('User not found');
  }

  users[idx].password = newHashedPassword;
  users[idx].updatedAt = new Date().toISOString();
  saveUsersToDisk(users);
  cachedUsers = users;
  return users[idx];
}

// ==========================================
// PASSWORD RESET SESSIONS
// ==========================================

/**
 * Creates a 6-digit code and token for password reset
 */
function createPasswordResetSession(userId, identifier) {
  const sessions = loadResetSessions().filter(s => s.expiresAt > Date.now()); // purge expired
  
  const resetCode = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
  const resetToken = crypto.randomBytes(32).toString('hex');
  const sessionId = `rst_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const expiresAt = Date.now() + 30 * 60 * 1000; // 30 minutes validity

  const session = {
    id: sessionId,
    userId,
    identifier,
    resetCode,
    resetToken,
    expiresAt,
    createdAt: new Date().toISOString(),
    used: false
  };

  sessions.push(session);
  saveResetSessions(sessions);
  return session;
}

/**
 * Finds active reset session by code or token
 */
function findResetSession(codeOrToken) {
  if (!codeOrToken) return null;
  const needle = String(codeOrToken).trim();
  const sessions = loadResetSessions();
  const now = Date.now();

  return sessions.find(s => 
    !s.used &&
    s.expiresAt > now &&
    (s.resetCode === needle || s.resetToken === needle || s.id === needle)
  ) || null;
}

/**
 * Marks reset session as used
 */
function invalidateResetSession(sessionId) {
  const sessions = loadResetSessions();
  const idx = sessions.findIndex(s => s.id === sessionId || s.resetToken === sessionId || s.resetCode === sessionId);
  if (idx !== -1) {
    sessions[idx].used = true;
    sessions[idx].usedAt = new Date().toISOString();
    saveResetSessions(sessions);
  }
}

module.exports = {
  getAllUsers,
  normalizePhone,
  generateCustomUserId,
  findUserByEmail,
  findUserById,
  findUserByPhone,
  findUserByName,
  findUserByIdentifier,
  createUser,
  updateUserPassword,
  createPasswordResetSession,
  findResetSession,
  invalidateResetSession
};
