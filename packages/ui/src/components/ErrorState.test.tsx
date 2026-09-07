import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ErrorState } from "./ErrorState.js";

describe("ErrorState", () => {
  it("uses the default copy for a variant", () => {
    render(<ErrorState variant="network" />);
    expect(screen.getByText("Sin conexión con el servidor")).toBeInTheDocument();
  });

  it("allows overriding the copy", () => {
    render(<ErrorState variant="server" title="Falló todo" description="Detalle" />);
    expect(screen.getByText("Falló todo")).toBeInTheDocument();
    expect(screen.getByText("Detalle")).toBeInTheDocument();
  });

  it("invokes onRetry when the retry button is clicked", () => {
    const onRetry = vi.fn();
    render(<ErrorState variant="network" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("does not render a retry button without onRetry", () => {
    render(<ErrorState variant="network" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
