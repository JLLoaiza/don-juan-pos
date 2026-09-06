import { describe, expect, it } from "vitest";
import { uuidv7 } from "./uuidv7.js";

describe("uuidv7", () => {
  it("encodes version 7 and the RFC 4122 variant", () => {
    const id = uuidv7(1_725_587_200_000);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("sorts after an identifier generated at a later millisecond", () => {
    expect(uuidv7(1000) < uuidv7(1001)).toBe(true);
  });
});
