// Shared toJSON transform: expose `id`, hide Mongo internals.
function cleanTransform(_doc, ret) {
  ret.id = ret._id.toString();
  delete ret._id;
  delete ret.__v;
  delete ret.dedupeKey;
  delete ret.isActiveApplication;
  delete ret.deletedAt;
  return ret;
}

module.exports = { cleanTransform };
