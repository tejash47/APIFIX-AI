/**
 * Centralized error-handling middleware.
 *
 * When authController.login's try/catch calls next(err) after the
 * TypeError thrown deep inside authService.authenticate (reading
 * `.password` off a null user), Express routes that error here.
 *
 * This handler does not attempt to hide or reinterpret the error — it
 * reports a realistic 500 response, including the error message, so
 * that APIFIX can observe a genuine runtime failure signature rather
 * than a hardcoded stub.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);

  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message,
    // Stack traces are included here because this is a local demo/test
    // fixture meant to be inspected by an automated debugging tool.
    // A real production API should not expose stack traces to clients.
    stack: err.stack
  });
}

module.exports = errorHandler;
