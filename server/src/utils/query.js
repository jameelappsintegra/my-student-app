// Escapes user input before it is used inside a RegExp.
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPagination(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

// "-createdAt" -> { createdAt: -1 }
function parseSort(sort) {
  const desc = sort.startsWith("-");
  return { [desc ? sort.slice(1) : sort]: desc ? -1 : 1 };
}

module.exports = { escapeRegex, buildPagination, parseSort };
