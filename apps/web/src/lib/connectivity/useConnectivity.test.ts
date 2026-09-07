import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useConnectivity } from "./useConnectivity";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useConnectivity", () => {
  it("starts CHECKING and becomes ONLINE once the health check resolves", async () => {
    const checkHealth = vi.fn(async () => ({ status: "ok" }));
    const { result } = renderHook(() => useConnectivity({ checkHealth, intervalMs: 100000 }));

    expect(result.current.state).toBe("CHECKING");
    await waitFor(() => expect(result.current.state).toBe("ONLINE"));
    expect(result.current.lastCheckedAt).not.toBeNull();
  });

  it("becomes DEVICE_ONLY when the health check rejects", async () => {
    const checkHealth = vi.fn(async () => {
      throw new Error("unreachable");
    });
    const { result } = renderHook(() => useConnectivity({ checkHealth, intervalMs: 100000 }));

    await waitFor(() => expect(result.current.state).toBe("DEVICE_ONLY"));
  });

  it("reports DEVICE_ONLY immediately when the browser is offline", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const checkHealth = vi.fn(async () => ({ status: "ok" }));
    const { result } = renderHook(() => useConnectivity({ checkHealth, intervalMs: 100000 }));

    await waitFor(() => expect(result.current.state).toBe("DEVICE_ONLY"));
    expect(checkHealth).not.toHaveBeenCalled();
  });

  it("checkNow triggers another check on demand", async () => {
    const checkHealth = vi.fn(async () => ({ status: "ok" }));
    const { result } = renderHook(() => useConnectivity({ checkHealth, intervalMs: 100000 }));
    await waitFor(() => expect(result.current.state).toBe("ONLINE"));

    act(() => result.current.checkNow());
    await waitFor(() => expect(checkHealth).toHaveBeenCalledTimes(2));
  });
});
