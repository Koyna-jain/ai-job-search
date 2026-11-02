import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

// Every case here fails before any network request is made.
describe("flag validation", () => {
  const cases: [string[], string][] = [
    [["search"], "NO_LISTING"],
    [["search", "--field", "biology", "--country", "germany"], "NO_LISTING"],
    [["search", "--field", "Molecular Biology!"], "BAD_ARG"],
    [["search", "--field", "biology", "--bogus", "x"], "UNKNOWN_FLAG"],
    [["search", "--field", "biology", "--page", "2"], "UNKNOWN_FLAG"],
    [["search", "--field", "biology", "--jobage", "0.5"], "BAD_ARG"],
    [["search", "--field", "biology", "-q"], "BAD_ARG"],
    [["search", "--field", "biology", "--format", "xml"], "BAD_ARG"],
    [["detail"], "NO_ID"],
    [["detail", "https://example.com/ad/a/2026/b/1"], "BAD_ID"],
  ];
  for (const [args, code] of cases) {
    test(`${args.join(" ")} -> ${code}`, async () => {
      const r = await runCLI(args);
      expect(r.exitCode).toBe(1);
      expect(r.stdout).toBe("");
      expect(JSON.parse(r.stderr).code).toBe(code);
    });
  }
});
