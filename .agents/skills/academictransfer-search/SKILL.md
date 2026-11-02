---
name: academictransfer-search
version: 1.0.0
description: >
  Use this skill whenever the user wants to search academic and research jobs in
  the Netherlands on AcademicTransfer (academictransfer.com) - PhD positions,
  postdocs, researchers, lecturers and research support at Dutch universities,
  university medical centres (UMCs) and institutes in Amsterdam, Utrecht,
  Leiden, Rotterdam, Groningen, Nijmegen, Maastricht, Wageningen, Delft,
  Eindhoven and elsewhere, including life sciences such as molecular biology,
  immunology, neuroscience and cell biology. Trigger phrases: academic jobs in
  the Netherlands, Dutch PhD positions, postdoc Netherlands, AcademicTransfer,
  vacatures universiteit, promotieplaats, promovendus, postdoc vacature,
  onderzoeker vacature.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/academictransfer-search/cli/src/cli.ts *)
---

# AcademicTransfer Search Skill

Search live academic job listings on [academictransfer.com](https://www.academictransfer.com),
the main board for research and university jobs in the Netherlands. No authentication, no
API key, and **zero runtime dependencies** - it runs with just `bun`.

## Limits to know

- **First 10 matches only.** The search page server-renders 10 results; "Load more" goes
  through `api.academictransfer.com`, whose robots.txt disallows all access and which
  requires credentials, so this skill does not use it. The table output says when more
  matches exist (`10 of 24 matches shown`); make the query more specific to reach them.
- **No separate location filter.** Put the city in the query: `-q "immunology Utrecht"`.
- **Be gentle.** robots.txt asks for a 10-second crawl delay. Run searches one at a time,
  and wait ~10 s between calls (search and detail alike).

## Commands

### Search job listings

```bash
bun run .agents/skills/academictransfer-search/cli/src/cli.ts search --query "<keywords>" [flags]
```

- `--query <text>` / `-q` - **required.** Keywords, optionally with a city.
- `--jobage <days>` - posted within N days (filtered client-side on the publish date).
- `--limit <n>` / `-n` - cap results emitted.
- `--format json|table|plain` - default `json`.

There is no `--page` or `--location` flag (see above).

### Fetch full job detail

```bash
bun run .agents/skills/academictransfer-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric id from search results (e.g. `364988`), or pass the full
`https://www.academictransfer.com/en/jobs/<id>/...` URL. Returns the full description,
deadline, employment type, hours, salary range and required education.

## Usage examples

```bash
# Molecular biology jobs anywhere in the Netherlands
bun run .agents/skills/academictransfer-search/cli/src/cli.ts search -q "molecular biology" --format table

# Immunology postdocs posted in the last 30 days
bun run .agents/skills/academictransfer-search/cli/src/cli.ts search -q "postdoc immunology" --jobage 30 --format table

# PhD positions in cell biology in Leiden
bun run .agents/skills/academictransfer-search/cli/src/cli.ts search -q "PhD cell biology Leiden" --format table

# Neuroscience jobs in Amsterdam
bun run .agents/skills/academictransfer-search/cli/src/cli.ts search -q "neuroscience Amsterdam" --format table

# Full details for one job
bun run .agents/skills/academictransfer-search/cli/src/cli.ts detail 364988 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default - programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON: `{ "meta": { "count", "page", "totalMatches" }, "results": [ { id, title, company, location, date, deadline, summary, url } ] }`.
All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- Data source and parsing anchors: see `url-reference.md`.
- Many postings are in English; some (especially non-research staff) are in Dutch. Searching Dutch terms (`promovendus`, `onderzoeker`) finds those.
