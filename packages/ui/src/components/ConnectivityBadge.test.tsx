import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectivityBadge } from "./ConnectivityBadge.js";

describe("ConnectivityBadge", () => {
  it.each([
    ["ONLINE", "En línea"],
    ["LOCAL_ONLY", "Solo servidor local"],
    ["DEVICE_ONLY", "Sin conexión al servidor"],
    ["CHECKING", "Comprobando…"],
  ] as const)("labels %s as %s", (state, label) => {
    render(<ConnectivityBadge state={state} />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });
});
