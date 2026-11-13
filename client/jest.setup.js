import "@testing-library/jest-dom";

jest.mock("next/router", () => ({
  useRouter: () => ({ pathname: "/", asPath: "/", push: jest.fn() }),
}));
