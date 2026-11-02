---
name: academicpositions-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search academic and research jobs in
  Europe on AcademicPositions (academicpositions.com) - PhD positions, postdocs,
  researcher, lecturer and professor roles at universities and research
  institutes in Germany, the Netherlands, Switzerland, Austria, Belgium, France,
  Spain, Italy, the UK and the Nordics, including life science fields such as
  molecular biology, cell biology, bioinformatics, neuroscience, immunology,
  microbiology and genetics. Trigger phrases: academic jobs, PhD positions,
  postdoc jobs, research positions in Europe, university jobs, life science
  research jobs, Doktorandenstelle, Postdoc-Stelle, promotieplaats, poste de
  postdoctorat, contrato predoctoral, ph.d.-stilling.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/academicpositions-search/cli/src/cli.ts *)
---

# AcademicPositions Search Skill

Search live academic job listings on [academicpositions.com](https://academicpositions.com),
a Europe-wide board for PhD, postdoc and faculty jobs. No authentication, no API key, and
**zero runtime dependencies** - it runs with just `bun`.

## How it searches

The site's keyword search renders its results in the browser (Livewire), so this skill
reads the **server-rendered listing pages** instead - one per field, country or position
type - and applies your keywords, location and age filters client-side.

- Only the **first page (30 most recent jobs)** of a listing can be read: later pages
  (`?page=2`) are served a Cloudflare bot challenge, and this skill does not try to get
  past it. Pick the narrowest listing (a specific field beats a broad one) and run
  several searches rather than one broad one.
- Listings also carry a few **promoted ads** from other countries; `-l` removes them.
- Keep volume low: the site occasionally answers bursts of requests with the same
  challenge (exit 1, `SEARCH_FAILED` with a 403 message). Wait a little and retry.

## Commands

### Search job listings

```bash
bun run .agents/skills/academicpositions-search/cli/src/cli.ts search (--field <slug> | --country <slug> | --position <slug>) [flags]
```

Exactly one listing:
- `--field <slug>` / `-f` - research field: `molecular-biology`, `cell-biology`, `bioinformatics`, `neuroscience`, `immunology`, `microbiology`, `genetics`, `biology`, …
- `--country <slug>` / `-c` - `germany`, `netherlands`, `switzerland`, `austria`, `france`, `spain`, `belgium`, `sweden`, … (Denmark is thin here: use the Danish portals)
- `--position <slug>` - `phd`, `post-doc`, `researcher`, `associate-professor`, `professor`

Filters:
- `--query <text>` / `-q` - keywords; every word must appear in the title, summary, employer or position type.
- `--location <text>` / `-l` - words that must appear in the job's location, e.g. `Germany`, `Zurich`.
- `--jobage <days>` - posted within N days. Dates are **approximate**: the listing says "3 weeks ago" and months count as 30 days. `detail` gives the exact date.
- `--limit <n>` / `-n` - cap results emitted.
- `--format json|table|plain` - default `json`.

There is no `--page` flag (see above).

### Fetch full job detail

```bash
bun run .agents/skills/academicpositions-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the `id` from search results (`<employer>/<year>/<slug>/<number>`), or pass the
full `https://academicpositions.com/ad/...` URL. Returns the full description, exact
publish date and application deadline.

## Usage examples

```bash
# Molecular biology jobs in Germany
bun run .agents/skills/academicpositions-search/cli/src/cli.ts search --field molecular-biology -l Germany --format table

# Postdocs in Switzerland mentioning biology
bun run .agents/skills/academicpositions-search/cli/src/cli.ts search --country switzerland -q "postdoc biology" --format table

# PhD positions in neuroscience posted in the last 30 days
bun run .agents/skills/academicpositions-search/cli/src/cli.ts search --field neuroscience -q phd --jobage 30 --format table

# Immunology jobs in the Netherlands or Austria (one search per country)
bun run .agents/skills/academicpositions-search/cli/src/cli.ts search --field immunology -l Netherlands --format table
bun run .agents/skills/academicpositions-search/cli/src/cli.ts search --field immunology -l Austria --format table

# Full details for one job
bun run .agents/skills/academicpositions-search/cli/src/cli.ts detail university-neuchatel/2026/post-doctoral-researcher-4-years-100-fte-part-time-possible/254704 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default - programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON: `{ "meta": { "count", "page", "scannedJobs" }, "results": [ { id, title, company, location, date, posted, positionType, summary, url } ] }`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data source and parsing anchors: see `url-reference.md`.
- robots.txt allows all paths for generic user agents (checked 2026-11-02); the site's `Content-signal` says `ai-train=no`, which this skill respects by only reading listings for the user's own job search.
- `date` in search results is derived from relative text and can be off by days for older posts.
