const express = require('express');

const healthRoutes = require('./routes/healthRoutes');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not Found' });
});

// Centralized error handler — must be registered last.
app.use(errorHandler);

const PORT = process.env.PORT || 4001;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`APIFIX Demo Auth API listening on port ${PORT}`);
  });
}

module.exports = app;
