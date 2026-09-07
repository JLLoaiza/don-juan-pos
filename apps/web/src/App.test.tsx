import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { apiClient } from "./lib/api/client";

vi.mock("./lib/api/client", () => ({
  apiClient: { health: { getHealth: vi.fn() } },
}));

const getHealth = vi.mocked(apiClient.health.getHealth);

afterEach(() => {
  getHealth.mockReset();
});

function mockHealthy() {
  getHealth.mockResolvedValue({ status: "ok", database: "ok", checkedAt: "2026-09-06T00:00:00.000Z" });
}

function mockUnreachable() {
  getHealth.mockRejectedValue(new Error("network down"));
}

describe("App", () => {
  it("renders navigation and the real health snapshot on the home route", async () => {
    mockHealthy();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Salón" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText("ok")).toHaveLength(2));
  });

  it("renders a feature placeholder for /floor without inventing data", async () => {
    mockHealthy();
    render(
      <MemoryRouter initialEntries={["/floor"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Salón" })).toBeInTheDocument();
    expect(screen.getByText(/Aún no implementado/)).toBeInTheDocument();
  });

  it("shows the device-only banner when the health check fails", async () => {
    mockUnreachable();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText("SERVIDOR NO DISPONIBLE")).toBeInTheDocument();
  });

  it("explains the live connectivity state on /sync", async () => {
    mockHealthy();
    render(
      <MemoryRouter initialEntries={["/sync"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Sincronización" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/respondió correctamente/)).toBeInTheDocument());
  });

  it("renders the not-found page for unknown routes", () => {
    mockHealthy();
    render(
      <MemoryRouter initialEntries={["/unknown"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText("La ruta solicitada no existe.")).toBeInTheDocument();
  });
});
