/** Error with an HTTP status that is safe to show to the client. */
class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors; // optional { field: message } map
    this.expose = true;
  }
}

const badRequest = (msg, errors) => new ApiError(400, msg, errors);
const unauthorized = (msg = 'Please log in to continue') => new ApiError(401, msg);
const forbidden = (msg = 'You do not have permission to do that') => new ApiError(403, msg);
const notFound = (msg = 'Not found') => new ApiError(404, msg);
const conflict = (msg) => new ApiError(409, msg);
const invalid = (errors, msg = 'Please fix the highlighted fields') => new ApiError(422, msg, errors);

module.exports = ApiError;
module.exports.badRequest = badRequest;
module.exports.unauthorized = unauthorized;
module.exports.forbidden = forbidden;
module.exports.notFound = notFound;
module.exports.conflict = conflict;
module.exports.invalid = invalid;
