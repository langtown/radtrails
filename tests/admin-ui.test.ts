import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("next/link", async () => {
  const { createElement: createLinkElement } = await import("react");
  return {
    default: ({ href, ...props }: Record<string, unknown>) =>
      createLinkElement("a", { ...props, href }),
  };
});

vi.mock("next/image", async () => {
  const { createElement: createImageElement } = await import("react");
  return {
    default: ({ fill: _fill, ...props }: Record<string, unknown>) => {
      void _fill;
      return createImageElement("img", props);
    },
  };
});

import AdminDashboard from "@/app/admin/AdminDashboard";
import BootstrapAdminForm from "@/app/admin/setup/BootstrapAdminForm";

test("the admin dashboard shows a coach calendar per coach and a persona breakdown, and links to review and browse", () => {
  const html = renderToStaticMarkup(
    createElement(AdminDashboard, {
      stats: { users: 12, pendingProfiles: 3, publishedProfiles: 8 },
      coaches: [{ id: 42, displayName: "Coach Carol" }],
      profilesByPersona: {
        theteam: [],
        coach: [
          {
            userId: 42,
            email: "carol@example.com",
            accountName: "Coach Carol",
            personas: ["coach"],
            slug: "coach-carol",
            displayName: "Coach Carol",
            bio: null,
            imageUrl: null,
            imagePosition: null,
            status: "approved",
          },
        ],
        alumni: [],
      },
    }),
  );

  expect(html).toContain("Admin dashboard");
  expect(html).toContain('href="/admin/coaches/42"');
  expect(html).toContain("Coach Carol");
  expect(html).toContain('href="/admin/profiles/manage');
  expect(html).toContain('href="/admin/profiles"');
  expect(html).toContain('href="/admin/personas"');
  expect(html).toContain("8 approved public");
  expect(html).toContain("3");
  expect(html).toContain("waiting for review");
});

test("the admin dashboard shows empty states when there are no coaches yet", () => {
  const html = renderToStaticMarkup(
    createElement(AdminDashboard, {
      stats: { users: 1, pendingProfiles: 0, publishedProfiles: 0 },
      coaches: [],
      profilesByPersona: { theteam: [], coach: [], alumni: [] },
    }),
  );

  expect(html).toContain("No coaches yet.");
});

test("the first-admin form treats the setup code as a password", () => {
  const html = renderToStaticMarkup(createElement(BootstrapAdminForm));

  expect(html).toContain("One-time admin setup code");
  expect(html).toContain('type="password"');
  expect(html).toContain('minLength="32"');
  expect(html).toContain('maxLength="512"');
  expect(html).not.toContain("correct-admin-bootstrap-token");
});
