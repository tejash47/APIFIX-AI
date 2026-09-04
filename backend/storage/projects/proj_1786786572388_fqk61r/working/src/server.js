const express = require('express');
const cors = require('cors');
const { login } = require('./controllers/authController');
const { getUsers } = require('./controllers/userController');
const { getProducts } = require('./controllers/productController');

const app = express();
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[demo-api] ${req.method} ${req.path}`);
  next();
});

// Routes
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', service: 'demo-api' }));
app.get('/api/users', getUsers);
app.post('/api/auth/login', login);
app.get('/api/products', getProducts);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[demo-api Exception]', err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message,
    stack: err.stack
  });
});

const PORT = process.env.PORT || 4001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Demo API listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
