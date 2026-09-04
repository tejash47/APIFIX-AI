const users = require('../data/users');

/**
 * Find a user by email.
 * Returns the user object if found, otherwise `null`.
 *
 * NOTE: This deliberately returns `null` (not `undefined`) when no user
 * matches, which is a very common, realistic pattern. Callers further up
 * the chain must explicitly check for this before using the result.
 */
function findByEmail(email) {
  const match = users.find((u) => u.email === email);
  return match || null;
}

function findById(id) {
  const numericId = Number(id);
  const match = users.find((u) => u.id === numericId);
  return match || null;
}

function getAll() {
  // Never expose passwords in list responses.
  return users.map(({ password, ...safeUser }) => safeUser);
}

function create({ email, password, name }) {
  const nextId = users.length ? Math.max(...users.map((u) => u.id)) + 1 : 1;
  const newUser = { id: nextId, email, password, name: name || email.split('@')[0] };
  users.push(newUser);
  return newUser;
}

function existsByEmail(email) {
  return users.some((u) => u.email === email);
}

module.exports = {
  findByEmail,
  findById,
  getAll,
  create,
  existsByEmail
};
