#!/usr/bin/env bun
// Self-contained CLI for academicpositions.com - PhD, postdoc and faculty jobs
// across Europe (strong in DE, NL, CH, AT, BE, the Nordics, ES, FR, IT). Reads
// the site's public, server-rendered listing pages; no authentication, zero
// runtime dependencies.

import { runSearch, type ListingKind, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit", f: "field", c: "country" }
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

const HELP = `academicpositions-cli — search academic jobs on academicpositions.com (Europe-wide)

USAGE
  bun run src/cli.ts search (--field <slug> | --country <slug> | --position <slug>) [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

LISTING (exactly one)
  --field, -f <slug>      Research field, e.g. molecular-biology, cell-biology, bioinformatics,
                          neuroscience, immunology, microbiology, genetics, biology
  --country, -c <slug>    Country, e.g. germany, netherlands, switzerland, austria, denmark,
                          france, spain, sweden, belgium
  --position <slug>       Position type: phd, post-doc, associate-professor, professor, researcher

FILTERS (applied to the listing's first page: its 30 most recent jobs)
  --query, -q <text>      Keywords; every word must appear in title/summary/employer.
  --location, -l <text>   Location words that must appear, e.g. "Germany", "Basel".
  --jobage <days>         Posted within N days (dates are approximate: the site says "3 weeks ago").
  --limit, -n <n>         Cap results emitted.

  Only page 1 is available (later pages are behind a bot challenge), so pick the
  narrowest listing (a specific field) and narrow further with -l / -q. Listings
  also carry promoted ads from other places; -l filters those out.
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search --field molecular-biology -l Germany --format table
  bun run src/cli.ts search --country switzerland -q postdoc --format table
  bun run src/cli.ts search --position phd -q biology --jobage 30 --format table
  bun run src/cli.ts detail the-hebrew-university-of-jerusalem/2026/post-doc-for-bacterial-multicellular-interactions-and-development/247395 --format plain
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["field", "country", "position", "query", "location", "jobage", "limit", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

const SLUG = /^[a-z0-9-]+$/

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
    const kinds = (["field", "country", "position"] as ListingKind[]).filter((k) => flags[k] !== undefined)
    if (kinds.length !== 1) {
      return fail("pass exactly one of --field, --country or --position (e.g. --field molecular-biology)", "NO_LISTING")
    }
    const kind = kinds[0]
    const slug = flags[kind]
    if (typeof slug !== "string" || !SLUG.test(slug.trim().toLowerCase())) {
      return fail(`--${kind} needs a lowercase slug like "molecular-biology" or "germany", got ${typeof slug === "string" ? `"${slug}"` : "no value"}`, "BAD_ARG")
    }
    for (const name of ["query", "location"]) {
      if (flags[name] !== undefined && (typeof flags[name] !== "string" || !(flags[name] as string).trim())) {
        return fail(`--${name} requires a non-empty value`, "BAD_ARG")
      }
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
      kind,
      slug: slug.trim().toLowerCase(),
      query: typeof flags.query === "string" ? flags.query : undefined,
      location: typeof flags.location === "string" ? flags.location : undefined,
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
