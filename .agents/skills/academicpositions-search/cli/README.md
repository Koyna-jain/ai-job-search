# academicpositions-cli

Search PhD, postdoc and faculty jobs on [academicpositions.com](https://academicpositions.com)
from the command line. Zero runtime dependencies; `bun install` only pulls dev types for
`typecheck`.

```bash
bun run src/cli.ts search --field molecular-biology -l Germany --format table
bun run src/cli.ts detail <id|url> --format plain
bun run src/cli.ts --help
```

Reads the first page (30 jobs) of a field, country or position listing and filters it
client-side; later pages sit behind a bot challenge and are not fetched. See `../SKILL.md`
for flags and `../url-reference.md` for the parsing anchors.

```bash
bun run typecheck
bun run test   # offline: synthetic fixtures and flag validation, no network
```
