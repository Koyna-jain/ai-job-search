// Data source: academictransfer.com public, server-rendered pages: the search
// page /en/jobs/?q=<query> (first 10 results) and job pages
// /en/jobs/<id>/<slug>/ (JSON-LD JobPosting). No authentication required.
// The site's JSON API (api.academictransfer.com) is NOT used: its robots.txt
// disallows everything and it requires credentials. "Load more" goes through
// that API, so only the first 10 results of a query are reachable.
// robots.txt on www: `User-agent: *` Allow / with Crawl-delay: 10 (checked 2026-11-02).

export const BASE_URL = "https://www.academictransfer.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; academictransfer-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  // robots.txt asks for a 10 s crawl delay, so retries start there.
  let delay = 10000
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 1000)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 60000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  deadline: string | null
  summary: string | null
  url: string
}

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  deadline: string | null
  employmentType: string | null
  salary: string | null
  hoursPerWeek: string | null
  education: string | null
  url: string
  description: string | null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

/**
 * Characters a reader of the posting never sees but a model reading this
 * output does: C0/C1 controls other than tab, newline and carriage return, the
 * soft hyphen, bidi marks/embeddings/overrides/isolates, zero-width characters
 * and invisible operators, the BOM, variation selectors, and Unicode tag
 * characters (U+E0000-E007F), which can spell out a whole hidden instruction.
 */
const INVISIBLE_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F­؜᠎​-‏‪-‮⁠-⁯︀-️﻿\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu

/** Strip INVISIBLE_CHARS from every string in a result, recursively: the CLI's output boundary. */
export function stripInvisible<T>(value: T): T {
  if (typeof value === "string") return value.replace(INVISIBLE_CHARS, "") as T
  if (Array.isArray(value)) return value.map(stripInvisible) as T
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripInvisible(v)])) as T
  }
  return value
}

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"])

/** Whether an opening tag's attributes keep it from rendering: `hidden`, or an inline style that hides it. */
function isHiddenTag(attrs: string): boolean {
  for (const m of attrs.matchAll(/([^\s"'=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    const name = m[1].toLowerCase()
    const value = m[2] ?? m[3] ?? m[4] ?? ""
    if (name === "hidden") return true
    if (name === "style" && /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|mso-hide\s*:\s*all)\b/i.test(value)) {
      return true
    }
  }
  return false
}

/**
 * Drop markup a browser never renders - comments, <script>/<style>/<template>
 * blocks, and elements marked hidden - before tags are stripped, so the model
 * never sees words the posting's reader did not.
 */
export function visibleHtml(html: string): string {
  const src = html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi, "")
  const open = /<([a-zA-Z][a-zA-Z0-9-]*)(\s[^>]*)?>/g
  const kept: string[] = []
  let from = 0
  let m: RegExpExecArray | null
  while ((m = open.exec(src)) !== null) {
    if (!m[2] || !isHiddenTag(m[2])) continue
    const tag = m[1].toLowerCase()
    let end = open.lastIndex
    if (!VOID_TAGS.has(tag) && !m[0].endsWith("/>")) {
      // Skip to the matching close tag; an unclosed hidden element runs to the end.
      const same = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi")
      same.lastIndex = end
      end = src.length
      let depth = 1
      let s: RegExpExecArray | null
      while ((s = same.exec(src)) !== null) {
        if (s[1]) depth--
        else if (!s[0].endsWith("/>")) depth++
        if (depth === 0) {
          end = same.lastIndex
          break
        }
      }
    }
    kept.push(src.slice(from, m.index))
    from = end
    open.lastIndex = end
  }
  kept.push(src.slice(from))
  return kept.join("")
}

export function clean(html: string): string {
  return decodeHtmlEntities(visibleHtml(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

/** HTML block -> readable text that keeps paragraph and list breaks. */
export function htmlToText(html: string): string | null {
  const withBreaks = visibleHtml(html)
    .replace(/\s+/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
  return withBreaks.split("\n").map(clean).join("\n").replace(/\n{3,}/g, "\n\n").trim() || null
}

/**
 * Parse the search page into job cards. Each result is an <article> holding a
 * link to /en/jobs/<id>/<slug>/; the page is split per article and every chunk
 * is parsed independently, so one malformed card cannot break the rest.
 */
export function parseSearch(html: string): { cards: JobCard[]; total: number | null } {
  const cards: JobCard[] = []
  const chunks = html.split(/<article\b/i).slice(1)

  for (const raw of chunks) {
    const chunk = raw.split(/<\/article>/i)[0]
    const link = chunk.match(/href="\/en\/jobs\/(\d+)\/([a-z0-9-]+)\/?"/i)
    if (!link) continue
    const id = link[1]

    const h3 = chunk.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)
    const title = h3 ? clean(h3[1]) : ""
    if (!title) continue

    const p = chunk.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    const summary = p ? clean(p[1]) || null : null

    const deadline = chunk.match(/Deadline\s*<time[^>]*datetime="([^"]+)"/i)
    const published = chunk.match(/Published\s*<time[^>]*datetime="([^"]+)"/i)

    // The location is the last small grey span in the meta row; the employer
    // name sits under the logo, right-aligned.
    const loc = chunk.match(/<span class="text-at-small flex items-center[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
    const location = loc ? clean(loc[1]) || null : null
    const org = chunk.match(/<span class="text-at-small text-gray-700[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
      ?? chunk.match(/<img[^>]*alt="([^"]+)"/i)
    const company = org ? clean(org[1]) || null : null

    cards.push({
      id,
      title,
      company,
      location,
      date: published ? published[1].slice(0, 10) : null,
      deadline: deadline ? deadline[1].slice(0, 10) : null,
      summary,
      url: `${BASE_URL}/en/jobs/${id}/${link[2]}/`,
    })
  }

  const total = html.match(/(\d+)\s+of\s+(\d+)\s+visible/i)
  return { cards, total: total ? parseInt(total[2], 10) : cards.length || null }
}

interface JsonLdJobPosting {
  "@type"?: string
  title?: string
  description?: string
  datePosted?: string
  validThrough?: string
  employmentType?: string | string[]
  workHours?: string
  educationRequirements?: unknown
  baseSalary?: { currency?: string; value?: { minValue?: number; maxValue?: number; value?: number; unitText?: string } }
  hiringOrganization?: { name?: string }
  jobLocation?: { address?: { addressLocality?: string; addressCountry?: string | { name?: string } } }
}

/** Return the first schema.org JobPosting object embedded as JSON-LD (searched recursively). */
export function findJobPosting(html: string): JsonLdJobPosting | null {
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown
    try {
      data = JSON.parse(m[1])
    } catch {
      continue
    }
    const stack: unknown[] = [data]
    while (stack.length) {
      const node = stack.pop()
      if (Array.isArray(node)) stack.push(...node)
      else if (node && typeof node === "object") {
        const obj = node as Record<string, unknown>
        if (obj["@type"] === "JobPosting") return obj as JsonLdJobPosting
        stack.push(...Object.values(obj))
      }
    }
  }
  return null
}

function educationText(v: unknown): string | null {
  if (!v) return null
  if (typeof v === "string") return v
  if (Array.isArray(v)) return v.map(educationText).filter(Boolean).join(", ") || null
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    return (typeof o.credentialCategory === "string" ? o.credentialCategory : null) ?? (typeof o.name === "string" ? o.name : null)
  }
  return null
}

/** Parse a job page from its JSON-LD JobPosting (which carries the full description). */
export function parseDetail(html: string, id: string): JobDetail | null {
  const ld = findJobPosting(html)
  if (!ld || !ld.title) return null
  const addr = ld.jobLocation?.address
  const country = typeof addr?.addressCountry === "string" ? addr.addressCountry : addr?.addressCountry?.name
  const s = ld.baseSalary?.value
  const salary = s && (s.minValue || s.maxValue || s.value)
    ? `${ld.baseSalary?.currency ?? ""} ${s.minValue ?? s.value ?? "?"}${s.maxValue ? `-${s.maxValue}` : ""}${s.unitText ? ` per ${s.unitText.toLowerCase()}` : ""}`.trim()
    : null
  return {
    id,
    title: decodeHtmlEntities(ld.title),
    company: ld.hiringOrganization?.name ? decodeHtmlEntities(ld.hiringOrganization.name) : null,
    location: [addr?.addressLocality, country].filter(Boolean).join(", ") || null,
    date: ld.datePosted ?? null,
    deadline: ld.validThrough ?? null,
    employmentType: Array.isArray(ld.employmentType) ? ld.employmentType.join(", ") : ld.employmentType ?? null,
    salary,
    hoursPerWeek: ld.workHours ?? null,
    education: educationText(ld.educationRequirements),
    url: `${BASE_URL}/en/jobs/${id}/`,
    description: ld.description ? htmlToText(ld.description) : null,
  }
}

/**
 * Accept a numeric job id or an academictransfer.com /jobs/<id>/ URL (any
 * language prefix). Any other host is rejected.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^\d{4,}$/.test(trimmed)) return trimmed
  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^(www\.)?academictransfer\.com\//i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!/^(www\.)?academictransfer\.com$/i.test(parsed.hostname)) return null
  const m = parsed.pathname.match(/^\/(?:[a-z]{2}\/)?(?:jobs|vacatures)\/(\d{4,})(?:\/|$)/i)
  return m ? m[1] : null
}
