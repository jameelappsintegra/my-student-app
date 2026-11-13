// Shared toJSON transform: expose `id`, hide Mongo internals.
function cleanTransform(_doc, ret) {
  ret.id = ret._id.toString();
  delete ret._id;
  delete ret.__v;
  delete ret.dedupeKey;
  delete ret.isActiveApplication;
  delete ret.deletedAt;
  delete ret.searchTokens;
  return ret;
}

// Same shape for .lean() results, which skip toJSON transforms.
function toPublic(doc) {
  const out = { ...doc };
  return cleanTransform(null, out);
}

module.exports = { cleanTransform, toPublic };
