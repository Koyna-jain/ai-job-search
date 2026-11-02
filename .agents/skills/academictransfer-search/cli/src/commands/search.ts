import { BASE_URL, htmlFetch, parseSearch, stripInvisible, writeError, type JobCard } from "../helpers.js"

export interface SearchOpts {
  query: string
  jobage: number
  limit?: number
  format: "json" | "table" | "plain"
}

export function buildUrl(query: string): string {
  return `${BASE_URL}/en/jobs/?${new URLSearchParams({ q: query }).toString()}`
}

/** Keep cards published within the last `jobage` days (9999 = no filter). */
export function filterByAge(cards: JobCard[], jobage: number, now = new Date()): JobCard[] {
  if (jobage >= 9999) return cards
  const cutoff = new Date(now.getTime() - jobage * 86400000).toISOString().slice(0, 10)
  return cards.filter((c) => c.date !== null && c.date >= cutoff)
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 50).padEnd(50)
    const company = (c.company || "—").slice(0, 32).padEnd(32)
    const loc = (c.location || "—").slice(0, 16).padEnd(16)
    return `${c.id.padEnd(7)} ${title} ${company} ${loc} ${(c.date || "—").padEnd(10)} ${c.deadline || "—"}`
  })
  const header =
    "ID".padEnd(7) + " " + "TITLE".padEnd(50) + " " + "EMPLOYER".padEnd(32) + " " + "LOCATION".padEnd(16) + " " +
    "PUBLISHED".padEnd(10) + " DEADLINE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts.query))
    const { cards: all, total } = parseSearch(html)
    let cards = stripInvisible(filterByAge(all, opts.jobage))
    if (opts.limit !== undefined) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      const more = total !== null && total > all.length
        ? `\n(${all.length} of ${total} matches shown - the site serves only the first ${all.length}; refine the query to see others)`
        : ""
      process.stdout.write(renderTable(cards) + more + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · published ${c.date || "—"} · deadline ${c.deadline || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, page: 1, totalMatches: total }, results: cards }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
