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

import AdminDashboard from "@/app/admin/AdminDashboard";
import BootstrapAdminForm from "@/app/admin/setup/BootstrapAdminForm";

test("the admin dashboard links both management areas and shows counts", () => {
  const html = renderToStaticMarkup(
    createElement(AdminDashboard, {
      stats: { users: 12, pendingProfiles: 3, publishedProfiles: 8 },
    }),
  );

  expect(html).toContain("Admin dashboard");
  expect(html).toContain('href="/admin/profiles"');
  expect(html).toContain('href="/admin/personas"');
  expect(html).toContain("3");
  expect(html).toContain("profiles awaiting review");
  expect(html).toContain("12");
  expect(html).toContain("signed-in accounts");
  expect(html).toContain("8 approved public profiles");
});

test("the first-admin form treats the setup code as a password", () => {
  const html = renderToStaticMarkup(createElement(BootstrapAdminForm));

  expect(html).toContain("One-time admin setup code");
  expect(html).toContain('type="password"');
  expect(html).toContain('minLength="32"');
  expect(html).toContain('maxLength="512"');
  expect(html).not.toContain("correct-admin-bootstrap-token");
});
