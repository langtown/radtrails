import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("next/image", async () => {
  const { createElement: createImageElement } = await import("react");

  return {
    default: ({
      unoptimized: _unoptimized,
      ...props
    }: Record<string, unknown>) => {
      void _unoptimized;
      return createImageElement("img", props);
    },
  };
});

vi.mock("next/link", async () => {
  const { createElement: createLinkElement } = await import("react");

  return {
    default: ({ href, ...props }: Record<string, unknown>) =>
      createLinkElement("a", { ...props, href }),
  };
});

import {
  AuthControls,
  parseAuthDisplayUser,
  type AuthState,
} from "@/components/AuthNav";

function render(state: AuthState): string {
  return renderToStaticMarkup(createElement(AuthControls, { state }));
}

test("signed-out navigation offers the Google sign-in entry point", () => {
  const html = render({ status: "signedOut" });

  expect(html).toContain('href="/api/auth/login"');
  expect(html).toContain("Sign in with Google");
  expect(html).not.toContain("rad_session");
});

test("signed-in navigation shows the display name, avatar, and profile link", () => {
  const html = render({
    status: "signedIn",
    user: {
      displayName: "Rider One",
      pictureUrl: "https://example.com/avatar.jpg",
      isAdmin: false,
    },
  });

  expect(html).toContain("Rider One");
  expect(html).toContain('href="/profile"');
  expect(html).toContain("https://example.com/avatar.jpg");
});

test("signed-in navigation signs out through a POST form", () => {
  const html = render({
    status: "signedIn",
    user: { displayName: null, pictureUrl: null, isAdmin: false },
  });

  expect(html).toContain('action="/api/auth/logout"');
  expect(html).toContain('method="post"');
  expect(html).toContain("Sign out");
  expect(html).toContain("Profile");
});

test("loading navigation renders neither a false login nor stale identity", () => {
  const html = render({ status: "loading" });

  expect(html).toContain('aria-label="Checking sign-in status"');
  expect(html).not.toContain("Sign in with Google");
  expect(html).not.toContain("Sign out");
});

test("the API parser retains display fields but discards identity fields", () => {
  const parsed = parseAuthDisplayUser({
    displayName: "Rider One",
    pictureUrl: "https://example.com/avatar.jpg",
    email: "rider@example.com",
    personas: ["member"],
    id: 123,
    userId: 123,
    googleSub: "immutable-subject",
    token: "must-not-survive",
  });

  expect(parsed).toEqual({
    displayName: "Rider One",
    pictureUrl: "https://example.com/avatar.jpg",
    isAdmin: false,
  });
  expect(JSON.stringify(parsed)).not.toContain("immutable-subject");
  expect(JSON.stringify(parsed)).not.toContain("must-not-survive");
});

test("admin navigation exposes the protected dashboard without storing raw personas", () => {
  const parsed = parseAuthDisplayUser({
    displayName: "Site Owner",
    pictureUrl: null,
    personas: ["member", "admin"],
  });
  const html = render({ status: "signedIn", user: parsed! });

  expect(parsed).toEqual({
    displayName: "Site Owner",
    pictureUrl: null,
    isAdmin: true,
  });
  expect(html).toContain('href="/admin"');
  expect(html).toContain("Admin");
  expect(JSON.stringify(parsed)).not.toContain("member");
});

test("the API parser rejects malformed display fields", () => {
  expect(parseAuthDisplayUser(null)).toBeNull();
  expect(parseAuthDisplayUser({ displayName: 42, pictureUrl: null })).toBeNull();
  expect(parseAuthDisplayUser({ displayName: null, pictureUrl: 42 })).toBeNull();
});
