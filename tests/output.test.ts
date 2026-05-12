import { describe, expect, test } from "bun:test";
import { getOutputMode, outputPlainTrack } from "../src/lib/output";


describe("getOutputMode", () => {
  test("defaults to human output", () => {
    expect(getOutputMode({})).toBe("human");
  });

  test("selects json output", () => {
    expect(getOutputMode({ json: true })).toBe("json");
  });

  test("selects plain output", () => {
    expect(getOutputMode({ plain: true })).toBe("plain");
  });

  test("rejects conflicting output modes", () => {
    expect(() => getOutputMode({ json: true, plain: true })).toThrow("cannot be used together");
  });
});

describe("plain output", () => {
  test("escapes tabs and newlines in track fields", () => {
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (value?: unknown) => {
      lines.push(String(value));
    };

    try {
      outputPlainTrack({
        id: "native:persistent:ABC123",
        source: "native",
        persistentId: "ABC123",
        name: "one\ttwo",
        artist: "line\nbreak",
        album: "carriage\rreturn",
        duration: 61,
      });
    } finally {
      console.log = originalLog;
    }

    expect(lines).toEqual([
      "track\tnative:persistent:ABC123\tone\\ttwo\tline\\nbreak\tcarriage\\rreturn\t1:01\tnative",
    ]);
  });
});
