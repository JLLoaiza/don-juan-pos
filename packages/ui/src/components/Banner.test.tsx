import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Banner } from "./Banner.js";

describe("Banner", () => {
  it("renders the device-only warning as an alert", () => {
    render(
      <Banner
        tone="danger"
        title="SERVIDOR LOCAL NO DISPONIBLE"
        description="El dispositivo está operando en modo aislado."
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("SERVIDOR LOCAL NO DISPONIBLE");
  });

  it("renders an informational tone as status", () => {
    render(<Banner tone="info" title="Aviso" />);
    expect(screen.getByRole("status")).toHaveTextContent("Aviso");
  });
});
