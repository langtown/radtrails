import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => createElement("img", props),
}));

vi.mock("next/link", () => ({
  default: ({ href, ...props }: Record<string, unknown>) =>
    createElement("a", { ...props, href }),
}));

import { NavUtilityArea } from "@/components/NavBar";

test("positions the signed-in identity before the social links", () => {
  const html = renderToStaticMarkup(
    createElement(NavUtilityArea, {
      authControls: createElement("span", null, "David Blackburn"),
    }),
  );

  expect(html).toContain('class="flex items-center gap-4"');
  expect(html.indexOf("David Blackburn")).toBeLessThan(
    html.indexOf('aria-label="Facebook"'),
  );
  expect(html.indexOf('aria-label="Facebook"')).toBeLessThan(
    html.indexOf('aria-label="Instagram"'),
  );
});
