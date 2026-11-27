// Small helpers for "may this staff member work with this school?".
const ApiError = require("../utils/ApiError");
const { schoolIds } = require("../middleware/authorize");
const { oid } = require("./classScope");

// True for admins, principals of the school, and teachers assigned there.
const inSchool = (user, school) => {
  const ids = schoolIds(user);
  return ids === null || ids.includes(String(school));
};
function assertSchool(user, school, what = "school") {
  if (!inSchool(user, school)) throw ApiError.notFound(`${what[0].toUpperCase()}${what.slice(1)} not found`);
}
// Mongo filter for documents with a `school` field this staff user may see.
function schoolFilter(user, requested) {
  const ids = schoolIds(user);
  if (requested) {
    if (ids !== null && !ids.includes(String(requested))) return { _id: { $in: [] } };
    return { school: oid(requested) };
  }
  return ids === null ? {} : { school: { $in: ids.map(oid) } };
}

module.exports = { inSchool, assertSchool, schoolFilter };
