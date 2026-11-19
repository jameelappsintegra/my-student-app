import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter } from "next/router";
import Login from "../pages/login";
import { AuthProvider, safeNext, useAuth } from "../context/auth";
import { api, ApiError } from "../services/api";

jest.mock("next/router", () => ({ useRouter: jest.fn() }));
jest.mock("../services/api", () => {
  const actual = jest.requireActual("../services/api");
  return { ...actual, api: { auth: { me: jest.fn(), login: jest.fn(), logout: jest.fn() } } };
});

const router = (over = {}) => ({ pathname: "/", asPath: "/", query: {}, replace: jest.fn(), push: jest.fn(), ...over });
let assign;

beforeEach(() => {
  jest.clearAllMocks();
  assign = jest.fn();
  delete window.location;
  window.location = { assign, pathname: "/", search: "" };
});

test("safeNext blocks off-site redirects", () => {
  expect(safeNext("/admissions?x=1")).toBe("/admissions?x=1");
  for (const bad of ["//evil.example", "https://evil.example", "javascript:alert(1)", undefined, ["/a"]]) {
    expect(safeNext(bad)).toBe("/");
  }
});

describe("login page", () => {
  test("signs in and returns to the requested page", async () => {
    useRouter.mockReturnValue(router({ pathname: "/login", query: { next: "/admissions" } }));
    api.auth.login.mockResolvedValue({ data: { user: { username: "admin" } } });
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByLabelText("Username"), " admin ");
    await user.type(screen.getByLabelText("Password"), "secret passphrase");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(api.auth.login).toHaveBeenCalledWith("admin", "secret passphrase");
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/admissions"));
  });

  test("ignores an off-site next parameter", async () => {
    useRouter.mockReturnValue(router({ pathname: "/login", query: { next: "//evil.example" } }));
    api.auth.login.mockResolvedValue({ data: {} });
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "pw");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("/"));
  });

  test("shows the server message and clears the password on failure", async () => {
    useRouter.mockReturnValue(router({ pathname: "/login" }));
    api.auth.login.mockRejectedValue(new ApiError("Incorrect username or password.", { status: 401 }));
    const user = userEvent.setup();
    render(<Login />);
    await user.type(screen.getByLabelText("Username"), "admin");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect username or password.");
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(assign).not.toHaveBeenCalled();
  });

  test("requires both fields before calling the API", async () => {
    useRouter.mockReturnValue(router({ pathname: "/login" }));
    const user = userEvent.setup();
    render(<Login />);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your username and password.");
    expect(api.auth.login).not.toHaveBeenCalled();
  });
});

describe("AuthProvider", () => {
  function Who() {
    const { user, signOut } = useAuth();
    return (
      <div>
        <span>Hello {user.username}</span>
        <button onClick={signOut}>Sign out</button>
      </div>
    );
  }

  test("renders private pages only after the session is confirmed", async () => {
    useRouter.mockReturnValue(router({ pathname: "/admissions", asPath: "/admissions" }));
    api.auth.me.mockResolvedValue({ data: { user: { username: "admin" } } });
    render(<AuthProvider><Who /></AuthProvider>);
    expect(screen.getByText("Checking your session…")).toBeInTheDocument();
    expect(await screen.findByText("Hello admin")).toBeInTheDocument();
  });

  test("redirects to sign in when there is no session", async () => {
    const r = router({ pathname: "/myclass", asPath: "/myclass?className=2" });
    useRouter.mockReturnValue(r);
    api.auth.me.mockRejectedValue(new ApiError("Please sign in", { status: 401 }));
    render(<AuthProvider><Who /></AuthProvider>);
    await waitFor(() => expect(r.replace).toHaveBeenCalledWith("/login?next=%2Fmyclass%3FclassName%3D2"));
    expect(screen.queryByText(/Hello/)).not.toBeInTheDocument();
  });

  test("the login page renders without a session check", () => {
    useRouter.mockReturnValue(router({ pathname: "/login" }));
    render(<AuthProvider><p>login form</p></AuthProvider>);
    expect(screen.getByText("login form")).toBeInTheDocument();
    expect(api.auth.me).not.toHaveBeenCalled();
  });

  test("sign out ends the session and returns to sign in", async () => {
    const r = router({ pathname: "/" });
    useRouter.mockReturnValue(r);
    api.auth.me.mockResolvedValue({ data: { user: { username: "admin" } } });
    api.auth.logout.mockResolvedValue({});
    const user = userEvent.setup();
    render(<AuthProvider><Who /></AuthProvider>);
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(api.auth.logout).toHaveBeenCalled();
    await waitFor(() => expect(r.replace).toHaveBeenCalledWith("/login"));
  });
});
