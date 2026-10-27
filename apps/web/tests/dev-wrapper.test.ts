import { it, expect } from "vitest";
import { nextDevArguments } from "../scripts/dev.mjs";
it("maps managed-preview host/port flags to the Next CLI and removes strictPort", () => {
  expect(
    nextDevArguments(["--host", "0.0.0.0", "--port", "4173", "--strictPort"]),
  ).toEqual(["dev", "--hostname", "0.0.0.0", "--port", "4173"]);
});
it("supports equals syntax without overriding an explicit hostname", () => {
  expect(
    nextDevArguments(["--host=127.0.0.1", "--port=4173", "--strictPort=true"]),
  ).toEqual(["dev", "--hostname", "127.0.0.1", "--port=4173"]);
  expect(nextDevArguments(["--hostname", "127.0.0.1", "--turbo"])).toEqual([
    "dev",
    "--hostname",
    "127.0.0.1",
    "--turbo",
  ]);
});
it("leaves the port unspecified for the normal Next default or PORT environment", () => {
  expect(nextDevArguments([])).toEqual(["dev", "--hostname", "0.0.0.0"]);
});
