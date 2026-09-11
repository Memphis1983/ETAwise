import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("brand, stage, and accessible responsive layout", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Follow-through",
  );
  await expect(
    page.getByText("In development", { exact: true }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("interactive preview exposes fictional evidence without pretending to run AI", async ({
  page,
}) => {
  await page.goto("/#preview");
  await page.getByRole("button", { name: /Scheduled/ }).click();
  await expect(page.locator("#case-title")).toHaveText(
    "On-site visit confirmed",
  );
  await page.getByRole("button", { name: /Needs attention/ }).click();
  await expect(page.locator("#case-title")).toHaveText(
    "A busy thread. A stalled case.",
  );
  await page.getByRole("button", { name: "View source message" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Fictional source message",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("early access is honest and legal notices work", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("link", { name: "Early access", exact: true })
    .first()
    .click();
  await expect(page.getByText("Registration is not open yet.")).toBeVisible();
  await page.getByRole("button", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "No signup information is collected",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Terms", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "not a live support service",
  );
});

test("mobile navigation and FAQ support keyboard and touch", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await page
      .getByRole("link", { name: "How it works", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: "Toggle navigation" }),
    ).toHaveAttribute("aria-expanded", "false");
  }
  await page
    .locator("summary")
    .filter({ hasText: "Does ETAwise predict a resolution ETA?" })
    .click();
  await expect(
    page.getByText(/No. A promised update is not a promised fix/),
  ).toBeVisible();
});
