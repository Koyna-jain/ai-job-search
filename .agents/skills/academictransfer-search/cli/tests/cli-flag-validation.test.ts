import { describe, expect, test } from "bun:test";
import { runCLI } from "./helpers";

// Every case here fails before any network request is made.
describe("flag validation", () => {
  const cases: [string[], string][] = [
    [["search"], "NO_QUERY"],
    [["search", "-q"], "NO_QUERY"],
    [["search", "-q", "   "], "NO_QUERY"],
    [["search", "-q", "biology", "--location", "Leiden"], "UNKNOWN_FLAG"],
    [["search", "-q", "biology", "--page", "2"], "UNKNOWN_FLAG"],
    [["search", "-q", "biology", "--jobage", "0"], "BAD_ARG"],
    [["search", "-q", "biology", "--format", "xml"], "BAD_ARG"],
    [["detail"], "NO_ID"],
    [["detail", "https://example.com/en/jobs/364988/"], "BAD_ID"],
    [["nope"], "BAD_CMD"],
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
