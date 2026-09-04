const authService = require('../services/authService');
const userService = require('../services/userService');

/**
 * POST /api/auth/login
 *
 * This controller calls straight into authService.authenticate, which
 * contains the intentional null-handling bug. When the given email does
 * not match any user, authService.authenticate throws a TypeError while
 * reading `.password` off a null user object. That exception propagates
 * up through this controller (there is no try/catch here) to the
 * Express error-handling middleware in server.js, which responds with
 * HTTP 500.
 */
function login(req, res, next) {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'email and password are required'
    });
  }

  try {
    const result = authService.authenticate(email, password);

    if (!result.success) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    const token = authService.generateToken(result.user);

    return res.status(200).json({
      success: true,
      token,
      user: {
        id: result.user.id,
        email: result.user.email
      }
    });
  } catch (err) {
    // The controller does forward unexpected errors to the centralized
    // error handler, but it does NOT guard against the specific null
    // user case inside authService — that's the bug APIFIX should find.
    return next(err);
  }
}

/**
 * POST /api/auth/register
 */
function register(req, res) {
  const { email, password, name } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'email and password are required'
    });
  }

  if (userService.existsByEmail(email)) {
    return res.status(409).json({
      success: false,
      error: 'A user with that email already exists'
    });
  }

  const newUser = userService.create({ email, password, name });

  return res.status(201).json({
    success: true,
    user: {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name
    }
  });
}

module.exports = {
  login,
  register
};
