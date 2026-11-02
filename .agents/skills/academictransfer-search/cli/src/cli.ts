#!/usr/bin/env bun
// Self-contained CLI for academictransfer.com - the main board for academic
// and research jobs in the Netherlands (PhD, postdoc, researcher, lecturer,
// support staff at Dutch universities, UMCs and institutes). Reads public,
// server-rendered pages; no authentication, zero runtime dependencies.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `academictransfer-cli — search academic jobs in the Netherlands on academictransfer.com

USAGE
  bun run src/cli.ts search --query "<keywords>" [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords. REQUIRED. Put a city in the query to narrow by place
                          ("immunology Utrecht"); there is no separate location filter.
  --jobage <days>         Posted within N days (filtered client-side).
  --limit, -n <n>         Cap results emitted.
  --format <fmt>          json (default) | table | plain.

  The site returns the first 10 matches only (more load through an API this CLI may
  not use), so make queries specific. The table output says when more exist.

EXAMPLES
  bun run src/cli.ts search -q "molecular biology" --format table
  bun run src/cli.ts search -q "postdoc immunology" --jobage 30 --format table
  bun run src/cli.ts search -q "PhD cell biology Leiden" --format table
  bun run src/cli.ts detail 364988 --format plain

Be gentle: robots.txt asks for 10 seconds between requests.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "jobage", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

function fail(error: string, code: string): number {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
  return 1
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  // Unknown flags are rejected, never silently ignored: a dropped filter
  // changes what the search returns with no error.
  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      return fail(`unknown flag --${key} for '${cmd}' - see --help for the supported flags`, "UNKNOWN_FLAG")
    }
  }

  if (cmd === "search") {
    if (typeof flags.query !== "string" || !flags.query.trim()) {
      return fail('--query/-q is required and needs keywords (e.g. -q "molecular biology")', "NO_QUERY")
    }
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "table", "plain"].includes(fmt)) {
      return fail(`--format must be one of json|table|plain, got "${fmt}"`, "BAD_ARG")
    }
    const ints: Record<string, number> = {}
    for (const name of ["jobage", "limit"]) {
      if (flags[name] === undefined) continue
      const raw = flags[name]
      const val = typeof raw === "string" ? Number(raw.trim()) : NaN
      if (!Number.isInteger(val) || val < 1) {
        return fail(`--${name} must be a whole number of at least 1, got "${raw}"`, "BAD_ARG")
      }
      ints[name] = val
    }
    const opts: SearchOpts = {
      query: flags.query.trim(),
      jobage: ints.jobage ?? 9999,
      limit: ints.limit,
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) return fail("detail requires an <id|url>", "NO_ID")
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "plain"].includes(fmt)) {
      return fail(`--format must be one of json|plain, got "${fmt}"`, "BAD_ARG")
    }
    const opts: DetailOpts = { id, format: fmt as DetailOpts["format"] }
    return runDetail(opts)
  }

  return fail(`Unknown command "${cmd}"`, "BAD_CMD")
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n",
    )
    process.exit(1)
  })
