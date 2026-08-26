import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { VisitStats } from "@/components/VisitStats";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows TODAY and 30 DAYS after a successful response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ available: true, today: 7, thirtyDays: 123 }),
  }));
  render(<VisitStats />);
  expect(await screen.findByText("TODAY")).toBeTruthy();
  expect(screen.getByText("7명")).toBeTruthy();
  expect(screen.getByText("30 DAYS")).toBeTruthy();
  expect(screen.getByText("123명")).toBeTruthy();
});

it("stays hidden when visitor metrics are unavailable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: false }) }));
  const { container } = render(<VisitStats />);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(container.textContent).toBe("");
});
