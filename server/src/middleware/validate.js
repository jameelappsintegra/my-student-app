const ApiError = require("../utils/ApiError");
const { objectId } = require("../validators/common");

function formatIssues(issues) {
  return issues.map((i) => ({ field: i.path.join("."), message: i.message }));
}

// Parses req[source] with a zod schema and stores the result on req.valid.
const validate = (schema, source = "body") => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    return next(
      ApiError.badRequest("Validation failed", formatIssues(result.error.issues))
    );
  }
  req.valid = { ...(req.valid || {}), [source]: result.data };
  return next();
};

const validateId = (req, _res, next) => {
  if (!objectId.safeParse(req.params.id).success) {
    return next(ApiError.badRequest("Invalid id"));
  }
  return next();
};

module.exports = { validate, validateId };
