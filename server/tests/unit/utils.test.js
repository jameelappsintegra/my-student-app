const { escapeRegex, buildPagination, parseSort, searchFilter } = require("../../src/utils/query");
const { buildDedupeKey, buildSearchTokens } = require("../../src/models/common");
const { toPublic } = require("../../src/utils/serialize");
const { ADMISSION_TRANSITIONS, ADMISSION_STATUSES } = require("../../src/constants");

test("escapeRegex neutralises regex metacharacters", () => {
  const rx = new RegExp(escapeRegex(".*(a+)+$"));
  expect(rx.test(".*(a+)+$")).toBe(true);
  expect(rx.test("anything")).toBe(false);
});

test("buildPagination", () => {
  expect(buildPagination(1, 10, 0)).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 });
  expect(buildPagination(2, 10, 21)).toEqual({ page: 2, limit: 10, total: 21, totalPages: 3 });
});

test("parseSort", () => {
  expect(parseSort("-createdAt")).toEqual({ createdAt: -1 });
  expect(parseSort("lastName")).toEqual({ lastName: 1 });
});

test("searchFilter builds anchored, escaped, lower-case prefixes", () => {
  const f = searchFilter("  Aisha  RAH.* ");
  expect(f.searchTokens.$all.map(String)).toEqual(["/^aisha/", "/^rah\\.\\*/"]);
  expect(searchFilter("   ")).toEqual({});
  expect(searchFilter("a b c d e f g").searchTokens.$all).toHaveLength(5);
});

test("buildDedupeKey normalises case, spacing and time of day", () => {
  const a = buildDedupeKey({ firstName: " Aisha ", lastName: "RAHMAN", dateOfBirth: "2018-03-14" });
  const b = buildDedupeKey({ firstName: "aisha", lastName: "rahman", dateOfBirth: new Date("2018-03-14T00:00:00Z") });
  expect(a).toBe(b);
  expect(a).toBe("aisha|rahman|2018-03-14");
});

test("buildSearchTokens splits names and includes the record number", () => {
  expect(
    buildSearchTokens({ firstName: "Mary Ann", lastName: "Lee", admissionNumber: "ADM-2026-00001" }, "admissionNumber")
  ).toEqual(["mary", "ann", "lee", "adm-2026-00001"]);
});

test("toPublic exposes id and hides internals", () => {
  const out = toPublic({ _id: { toString: () => "abc" }, __v: 0, dedupeKey: "k", searchTokens: [], deletedAt: null, firstName: "A" });
  expect(out).toEqual({ id: "abc", firstName: "A" });
});

test("admission transitions never allow leaving a terminal state or jumping to enrolled", () => {
  expect(ADMISSION_TRANSITIONS.rejected).toEqual([]);
  expect(ADMISSION_TRANSITIONS.enrolled).toEqual([]);
  for (const s of ADMISSION_STATUSES) {
    expect(ADMISSION_TRANSITIONS[s]).not.toContain("enrolled");
    for (const t of ADMISSION_TRANSITIONS[s]) expect(ADMISSION_STATUSES).toContain(t);
  }
});
