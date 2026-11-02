# academictransfer-cli

Search academic jobs in the Netherlands on [academictransfer.com](https://www.academictransfer.com)
from the command line. Zero runtime dependencies; `bun install` only pulls dev types for
`typecheck`.

```bash
bun run src/cli.ts search -q "molecular biology" --format table
bun run src/cli.ts detail 364988 --format plain
bun run src/cli.ts --help
```

Reads the server-rendered search page (first 10 matches) and the job page's JSON-LD. The
site's API is off-limits by its robots.txt and is not used. robots.txt asks for 10 s between
requests. See `../SKILL.md` for flags and `../url-reference.md` for the parsing anchors.

```bash
bun run typecheck
bun run test   # offline: synthetic fixtures and flag validation, no network
```
