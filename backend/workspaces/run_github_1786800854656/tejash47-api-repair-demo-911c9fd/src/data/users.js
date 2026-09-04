// In-memory demo user store.
// No real credentials — passwords here are plain demo strings for a
// local test fixture only. Never do this in a production system.

const users = [
  { id: 1, email: 'existing@example.com', password: 'correctpassword', name: 'Ada Lovelace' },
  { id: 2, email: 'grace@example.com', password: 'hopper123', name: 'Grace Hopper' },
  { id: 3, email: 'alan@example.com', password: 'turing123', name: 'Alan Turing' }
];

module.exports = users;
