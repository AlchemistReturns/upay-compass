import { describe, expect, it } from "vitest";
import { normalizeBdPhone, otpSchema, phoneSchema, pinSchema } from "./auth";

describe("normalizeBdPhone", () => {
  it.each([
    ["01700000001", "+8801700000001"],
    ["+8801700000001", "+8801700000001"],
    ["8801700000001", "+8801700000001"],
    ["017 0000-0001", "+8801700000001"],
    ["০১৭০০০০০০০১", "+8801700000001"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeBdPhone(input)).toBe(expected);
  });

  it.each(["", "12345", "01200000001", "+8801700", "+919876543210", "abc"])(
    "rejects %s",
    (input) => {
      expect(normalizeBdPhone(input)).toBeNull();
    },
  );

  it("phoneSchema transforms valid input and fails invalid", () => {
    expect(phoneSchema.parse("01700000001")).toBe("+8801700000001");
    expect(phoneSchema.safeParse("nope").success).toBe(false);
  });
});

describe("otp and pin schemas", () => {
  it("otp is exactly 6 digits", () => {
    expect(otpSchema.safeParse("123456").success).toBe(true);
    expect(otpSchema.safeParse("12345").success).toBe(false);
  });
  it("pin is 4-6 digits", () => {
    expect(pinSchema.safeParse("1234").success).toBe(true);
    expect(pinSchema.safeParse("123456").success).toBe(true);
    expect(pinSchema.safeParse("123").success).toBe(false);
    expect(pinSchema.safeParse("12a4").success).toBe(false);
  });
});
