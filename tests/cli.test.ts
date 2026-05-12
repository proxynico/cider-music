import { describe, expect, test } from "bun:test";

describe("CLI contracts", () => {
  test("rejects conflicting output modes before command execution", async () => {
    const proc = Bun.spawn({
      cmd: ["bun", "run", "src/index.ts", "--json", "--plain", "status"],
      cwd: import.meta.dir + "/..",
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(exitCode).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("--json and --plain cannot be used together");
  });
});
