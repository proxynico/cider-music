import { describe, expect, test } from "bun:test";
import { parseConfig } from "../src/lib/config";
import { ValidationError } from "../src/lib/errors";

describe("config parsing", () => {
  test("merges partial config with defaults", () => {
    expect(parseConfig('{"storefront":"nl"}', "config.json")).toEqual({
      defaultEngine: "auto",
      storefront: "nl",
    });
  });

  test("rejects invalid JSON", () => {
    expect(() => parseConfig("{", "config.json")).toThrow(ValidationError);
  });

  test("rejects invalid default engine", () => {
    expect(() => parseConfig('{"defaultEngine":"spotify"}', "config.json")).toThrow("Invalid default engine");
  });

  test("rejects non-string storefront", () => {
    expect(() => parseConfig('{"storefront":123}', "config.json")).toThrow("Invalid storefront");
  });
});
