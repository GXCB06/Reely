import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { isPrivateAddress } = await import("./link-preview");

describe("isPrivateAddress", () => {
  it("blocks private and loopback ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.20.0.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "104.21.1.1", "2606:4700::1"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });
});
