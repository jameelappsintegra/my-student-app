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

// "Aisha Rah" -> every word must prefix-match one of the search tokens.
function searchFilter(search) {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);
  if (!words.length) return {};
  return {
    searchTokens: { $all: words.map((w) => new RegExp(`^${escapeRegex(w)}`)) },
  };
}

module.exports = { escapeRegex, buildPagination, parseSort, searchFilter };
