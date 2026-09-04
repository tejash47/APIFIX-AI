const { usersDatabase } = require('./authController');

function getUsers(req, res) {
  const safeUsers = usersDatabase.map(u => ({ id: u.id, email: u.email, name: u.name }));
  res.status(200).json({ users: safeUsers });
}

module.exports = { getUsers };
