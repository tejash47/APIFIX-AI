const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.resolve(__dirname, '../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

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
    id: 'usr_admin_01',
    email: 'admin@apifix.ai',
    name: 'System Administrator',
    password: defaultHashedPassword,
    role: 'admin',
    createdAt: new Date().toISOString()
  },
  {
    id: 'usr_demo_01',
    email: 'dev@apifix.ai',
    name: 'Lead Reliability Engineer',
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
  // Initialize with seed users
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

let cachedUsers = loadUsersFromDisk();

function getAllUsers() {
  cachedUsers = loadUsersFromDisk();
  return cachedUsers;
}

function findUserByEmail(email) {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  const users = getAllUsers();
  return users.find(u => u.email.toLowerCase() === normalized) || null;
}

function findUserById(id) {
  if (!id) return null;
  const users = getAllUsers();
  return users.find(u => u.id === id) || null;
}

function createUser(userData) {
  const users = getAllUsers();
  const normalizedEmail = userData.email.trim().toLowerCase();
  
  const existing = users.find(u => u.email.toLowerCase() === normalizedEmail);
  if (existing) {
    throw new Error('An account with this email already exists');
  }

  const newUser = {
    id: userData.id || `usr_${Date.now()}`,
    email: normalizedEmail,
    name: userData.name ? userData.name.trim() : normalizedEmail.split('@')[0],
    password: userData.password,
    role: userData.role || 'developer',
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsersToDisk(users);
  cachedUsers = users;
  return newUser;
}

module.exports = {
  getAllUsers,
  findUserByEmail,
  findUserById,
  createUser
};
