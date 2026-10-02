import { defineConfig } from "vitest/config";

export default defineConfig({
  // Integration tests share test phone numbers (and their OTP rate limits), so run files one at a time.
  test: { fileParallelism: false },
});
