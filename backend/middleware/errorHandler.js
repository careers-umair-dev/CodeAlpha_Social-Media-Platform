const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` });
};

/** Central error handler: never leaks stack traces or internals to the client. */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.expose ? err.message : null;
  let errors = err.errors;

  if (err.name === 'ValidationError') {
    status = 422;
    errors = Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message]));
    message = 'Please fix the highlighted fields';
  } else if (err.name === 'CastError') {
    status = 400; message = 'Invalid id';
  } else if (err.code === 11000) {
    status = 409;
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    message = `That ${field} is already in use`;
    errors = { [field]: message };
  } else if (err.type === 'entity.too.large') {
    status = 413; message = 'That upload is too large';
  } else if (err.type === 'entity.parse.failed') {
    status = 400; message = 'Malformed JSON body';
  } else if (status === 429) {
    message = message || 'Too many requests. Please slow down.';
  }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    message = 'Something went wrong on our side. Please try again.';
  }
  res.status(status).json({ success: false, message: message || 'Request failed', ...(errors ? { errors } : {}) });
};

module.exports = { notFoundHandler, errorHandler };
