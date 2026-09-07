import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState.js";

describe("EmptyState", () => {
  it("renders a title and optional description", () => {
    render(<EmptyState title="Sin mesas" description="Aún no hay mesas configuradas." />);
    expect(screen.getByText("Sin mesas")).toBeInTheDocument();
    expect(screen.getByText("Aún no hay mesas configuradas.")).toBeInTheDocument();
  });

  it("renders an action node", () => {
    render(<EmptyState title="Sin mesas" action={<button>Crear</button>} />);
    expect(screen.getByRole("button", { name: "Crear" })).toBeInTheDocument();
  });
});
