const userService = require('../services/userService');

/**
 * GET /api/users
 */
function getUsers(req, res) {
  const users = userService.getAll();
  return res.status(200).json({
    success: true,
    count: users.length,
    users
  });
}

/**
 * GET /api/users/:id
 */
function getUserById(req, res) {
  const user = userService.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'User not found'
    });
  }

  const { password, ...safeUser } = user;
  return res.status(200).json({
    success: true,
    user: safeUser
  });
}

module.exports = {
  getUsers,
  getUserById
};
