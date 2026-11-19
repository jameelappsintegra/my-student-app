import "@testing-library/jest-dom";

// One stable router object, like Next's, so effects keyed on it don't loop.
const router = { pathname: "/", asPath: "/", query: {}, push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock("next/router", () => ({ useRouter: () => router }));
