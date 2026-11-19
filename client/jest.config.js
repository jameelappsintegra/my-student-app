const nextJest = require("next/jest");

const createJestConfig = nextJest({ dir: "./" });

module.exports = createJestConfig({
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "permissions-helper"],
  moduleNameMapper: { "\\.(css|scss)$": "<rootDir>/__mocks__/styleMock.js" },
});
