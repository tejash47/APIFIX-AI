const userService = require('./userService');

/**
 * Authenticate a user by email + password.
 *
 * INTENTIONAL BUG (for APIFIX test fixture purposes):
 * `userService.findByEmail` returns `null` when no user matches the given
 * email. This function does not check for that case before reading
 * `user.password`, so a login attempt for an email that does not exist
 * in the store will throw:
 *
 *   TypeError: Cannot read properties of null (reading 'password')
 *
 * This causes POST /api/auth/login to fail with an unhandled exception,
 * which the Express error-handling middleware converts into an HTTP 500
 * response.
 */
function authenticate(email, password) {
  const user = userService.findByEmail(email);

  // Guard against missing user
  if (!user) {
    return false;
  }
  const isPasswordValid = user.password === password;

  if (!isPasswordValid) {
    return { success: false, user: null };
  }

  const { password: _omit, ...safeUser } = user;
  return { success: true, user: safeUser };
}

function generateToken(user) {
  // Simple demo token generation — not for production use.
  const payload = Buffer.from(`${user.id}:${user.email}:${Date.now()}`).toString('base64');
  return `demo-token.${payload}`;
}

module.exports = {
  authenticate,
  generateToken
};
