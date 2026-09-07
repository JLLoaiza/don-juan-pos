import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LoadingState } from "./LoadingState.js";

describe("LoadingState", () => {
  it("shows a default label", () => {
    render(<LoadingState />);
    expect(screen.getByRole("status")).toHaveTextContent("Cargando…");
  });

  it("shows a custom label", () => {
    render(<LoadingState label="Comprobando estado del servidor…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Comprobando estado del servidor…");
  });
});
