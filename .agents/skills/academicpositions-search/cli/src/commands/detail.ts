import { BASE_URL, htmlFetch, normalizeId, parseDetail, stripInvisible, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(
      `Could not parse a job ID from "${opts.id}" - pass the id from search results (<employer>/<year>/<slug>/<n>) or an academicpositions.com/ad/... URL`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const html = await htmlFetch(`${BASE_URL}/ad/${id}`)
    if (!html) {
      writeError("Job not found (it may have been removed)", "NOT_FOUND")
      return 1
    }
    const job = stripInvisible(parseDetail(html, id))

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.date ? `Published: ${job.date}` : "",
        job.deadline ? `Deadline: ${job.deadline}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
