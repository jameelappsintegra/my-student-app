const mongoose = require("mongoose");
const ApiError = require("../utils/ApiError");
const { isTest } = require("../config/env");

function notFound(req, _res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.path} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  let status = err.statusCode || 500;
  let message = err.message;
  let errors = err.errors;

  if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = "Invalid id";
    errors = undefined;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = "Validation failed";
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  } else if (err.code === 11000) {
    status = 409;
    message = "A record with these details already exists";
    errors = undefined;
  } else if (err.type === "entity.parse.failed") {
    status = 400;
    message = "Request body is not valid JSON";
  } else if (err.type === "entity.too.large") {
    status = 413;
    message = "Request body is too large";
  }

  if (status >= 500) {
    if (!isTest) console.error(err);
    // Never leak internals (stack traces, driver messages) to clients.
    message = "Something went wrong. Please try again.";
    errors = undefined;
  }

  const body = { success: false, message };
  if (errors) body.errors = errors;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
