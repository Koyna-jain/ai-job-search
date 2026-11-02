import {
  BASE_URL,
  htmlFetch,
  matchesQuery,
  parseListing,
  stripInvisible,
  writeError,
  type JobCard,
} from "../helpers.js"

export type ListingKind = "field" | "country" | "position"

export interface SearchOpts {
  kind: ListingKind
  slug: string
  query?: string
  location?: string
  jobage: number
  limit?: number
  format: "json" | "table" | "plain"
}

// Only the first listing page is read: paginated URLs (?page=N) are served a
// Cloudflare bot challenge, and this CLI does not try to get past it.
export function buildUrl(kind: ListingKind, slug: string): string {
  return `${BASE_URL}/jobs/${kind}/${slug.split("/").map(encodeURIComponent).join("/")}`
}

/** Keep cards matching the client-side filters (keywords, location text, posting age). */
export function filterCards(cards: JobCard[], opts: Pick<SearchOpts, "query" | "location" | "jobage">, now = new Date()): JobCard[] {
  const cutoff = opts.jobage < 9999 ? new Date(now.getTime() - opts.jobage * 86400000).toISOString().slice(0, 10) : null
  return cards.filter((c) => {
    if (!matchesQuery(`${c.title} ${c.summary ?? ""} ${c.company ?? ""} ${c.positionType ?? ""}`, opts.query)) return false
    if (opts.location && !matchesQuery(c.location ?? "", opts.location)) return false
    if (cutoff && (!c.date || c.date < cutoff)) return false
    return true
  })
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 48).padEnd(48)
    const company = (c.company || "—").slice(0, 30).padEnd(30)
    const loc = (c.location || "—").slice(0, 26).padEnd(26)
    const type = (c.positionType || "—").slice(0, 12).padEnd(12)
    return `${title} ${company} ${loc} ${type} ${c.date || "—"}`
  })
  const header =
    "TITLE".padEnd(48) + " " + "EMPLOYER".padEnd(30) + " " + "LOCATION".padEnd(26) + " " + "TYPE".padEnd(12) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts.kind, opts.slug))
    if (!html) {
      writeError(`No ${opts.kind} listing named "${opts.slug}" (404). Check the slug on ${BASE_URL}/jobs/${opts.kind}/...`, "NOT_FOUND")
      return 1
    }
    const all = parseListing(html)
    let cards = stripInvisible(filterCards(all, opts))
    if (opts.limit !== undefined) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.positionType || "—"} · ${c.posted || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: cards.length, page: 1, scannedJobs: all.length }, results: cards },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
