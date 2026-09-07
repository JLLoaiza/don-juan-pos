import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HomePage } from "./HomePage";
import { ApiRequestError } from "../../lib/api/httpClient";

describe("HomePage", () => {
  it("shows a loading state and then the health snapshot", async () => {
    const fetchHealth = vi.fn(async () => ({
      status: "ok" as const,
      database: "ok" as const,
      checkedAt: "2026-09-06T00:00:00.000Z",
    }));
    render(<HomePage fetchHealth={fetchHealth} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("ok")).toHaveLength(2));
  });

  it("shows a network error state and retries on demand", async () => {
    const fetchHealth = vi.fn(async () => {
      throw new ApiRequestError("No se pudo contactar.", "network");
    });
    render(<HomePage fetchHealth={fetchHealth} />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText("No se pudo contactar.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(fetchHealth).toHaveBeenCalledTimes(2));
  });
});
