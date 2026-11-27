import { academicYearOptions, formatDate, classLabel, NEXT_ACTIONS } from "../constants";

test("academic year rolls over in April", () => {
  expect(academicYearOptions(new Date(2026, 2, 31))).toEqual(["2025-2026", "2026-2027"]);
  expect(academicYearOptions(new Date(2026, 3, 1))).toEqual(["2026-2027", "2027-2028"]);
});

test("formatDate uses the stored calendar date regardless of timezone", () => {
  expect(formatDate("2018-03-14T00:00:00.000Z")).toBe("14 Mar 2018");
  expect(formatDate("")).toBe("");
});

test("classLabel", () => {
  expect(classLabel("8")).toBe("Eighth Standard");
  expect(classLabel("LKG")).toBe("LKG");
});

test("client transitions match the server rules", () => {
  // Keep in sync with server/src/constants ADMISSION_TRANSITIONS.
  expect(NEXT_ACTIONS).toEqual({
    draft: ["submitted", "rejected"],
    submitted: ["under_review", "rejected"],
    under_review: ["documents_required", "approved", "rejected"],
    documents_required: ["under_review", "rejected"],
    approved: ["rejected"],
    rejected: [],
    enrolled: [],
  });
});
