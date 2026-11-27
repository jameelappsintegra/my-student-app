// Strips keys that MongoDB treats as operators ("$gt") or paths ("a.b"),
// so request data cannot be turned into a NoSQL injection payload.
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (key.startsWith("$") || key.includes(".")) continue;
      out[key] = clean(v);
    }
    return out;
  }
  return value;
}

module.exports = function sanitize(req, _res, next) {
  if (req.body) req.body = clean(req.body);
  if (req.query) req.query = clean(req.query);
  next();
};
