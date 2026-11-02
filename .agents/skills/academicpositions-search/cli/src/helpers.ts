// Data source: academicpositions.com public, server-rendered listing pages
// (/jobs/field/<slug>, /jobs/country/<slug>, /jobs/position/<slug>) and job-ad
// pages (/ad/<employer>/<year>/<slug>/<id>). No authentication required.
// The site's keyword search (/find-jobs) renders its results client-side via
// Livewire, so it is not used; keyword matching happens here, client-side.
// robots.txt allows `User-agent: *` on all paths (checked 2026-11-02).

export const BASE_URL = "https://academicpositions.com"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; academicpositions-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
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
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (response.status === 403) {
      // A Cloudflare challenge page; this CLI does not try to get past it.
      throw new Error("403 Forbidden - the site answered with a bot challenge; try again later or use a narrower listing")
    }
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
  posted: string | null
  positionType: string | null
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
  url: string
  description: string | null
}

/**
 * Extract the inner HTML of a <div> identified by a CSS class name, correctly
 * handling nested <div> elements by tracking tag depth.
 */
export function extractDivContent(html: string, className: string): string | null {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const openRe = new RegExp(`<div[^>]*class="[^"]*${escaped}[^"]*"[^>]*>`, "i")
  const open = openRe.exec(html)
  if (!open) return null

  let i = open.index + open[0].length
  let depth = 1

  while (depth > 0 && i < html.length) {
    const nextOpen = html.indexOf("<div", i)
    const nextClose = html.indexOf("</div>", i)

    if (nextClose === -1) return null

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth++
      i = nextOpen + 4
    } else {
      depth--
      i = nextClose + 6
    }
  }

  return html.slice(open.index + open[0].length, i - 6)
}

/**
 * Convert a Unicode code point to a string. Uses `fromCodePoint` (not
 * `fromCharCode`) so supplementary-plane code points decode correctly, and
 * drops out-of-range values instead of throwing.
 */
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

function stripTags(html: string): string {
  return visibleHtml(html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html)).replace(/\s+/g, " ").trim()
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

const UNIT_DAYS: Record<string, number> = {
  second: 0, minute: 0, hour: 0, day: 1, week: 7, month: 30, year: 365,
}

/**
 * Turn the listing's relative "Published 3 weeks ago" into an approximate ISO
 * date (YYYY-MM-DD). Months and years are approximations (30/365 days); the
 * raw text is kept alongside as `posted`.
 */
export function relativeToISO(text: string | null, now: Date = new Date()): string | null {
  if (!text) return null
  const t = text.toLowerCase()
  let days: number | null = null
  if (/\b(today|just now)\b/.test(t)) days = 0
  else if (/\byesterday\b/.test(t)) days = 1
  else {
    const m = t.match(/(\d+|an?|one)\s+(second|minute|hour|day|week|month|year)s?\s+ago/)
    if (m) {
      const n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : 1
      days = n * UNIT_DAYS[m[2]]
    }
  }
  if (days === null) return null
  const d = new Date(now.getTime() - days * 86400000)
  return d.toISOString().slice(0, 10)
}

/** The "<employer>/<year>/<slug>/<numeric id>" path after /ad/ - the fetchable job ID. */
const AD_PATH = /\/ad\/([a-z0-9-]+\/\d{4}\/[a-z0-9-]+\/\d+)\/?/i

/**
 * Parse a server-rendered listing page into job cards. The page is split on
 * each card's `job-list-item` class and every chunk is parsed independently,
 * so one malformed card cannot break the rest.
 */
export function parseListing(html: string): JobCard[] {
  const results: JobCard[] = []
  const chunks = html.split(/class="card[^"]*\bjob-list-item\b[^"]*"/).slice(1)

  for (const chunk of chunks) {
    const link = chunk.match(/<a\s+href="((?:https:\/\/academicpositions\.com)?\/ad\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!link) continue
    const path = link[1].match(AD_PATH)
    if (!path) continue
    const id = path[1]

    const titleHtml = link[2].match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)
    const title = titleHtml ? clean(titleHtml[1]) : ""
    if (!title) continue
    const summaryHtml = link[2].match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    const summary = summaryHtml ? clean(summaryHtml[1]) || null : null

    const employer = chunk.match(/href="https:\/\/academicpositions\.com\/employer\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
    const company = employer ? clean(employer[1]) || null : null

    const locs = chunk.match(/class="job-locations[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    const location = locs ? clean(locs[1]).replace(/\s+,/g, ",") || null : null

    const cal = chunk.match(/fe-calendar"[^>]*><\/i>\s*([^<]+)/i)
    const posted = cal ? clean(cal[1]).replace(/^published\s+/i, "") || null : null

    const pos = chunk.match(/href="https:\/\/academicpositions\.com\/jobs\/position\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
    const positionType = pos ? clean(pos[1]) || null : null

    results.push({
      id,
      title,
      company,
      location,
      date: relativeToISO(posted),
      posted,
      positionType,
      summary,
      url: `${BASE_URL}/ad/${id}`,
    })
  }

  return results
}

interface JsonLdJobPosting {
  "@type"?: string
  title?: string
  datePosted?: string
  validThrough?: string
  hiringOrganization?: { name?: string }
  jobLocation?: { address?: { addressLocality?: string; addressCountry?: string | { name?: string } } }
}

/** Return the first schema.org JobPosting object embedded as JSON-LD, if any. */
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

/** Parse a job-ad page: JSON-LD for the facts, the `ck-content` editor block for the full text. */
export function parseDetail(html: string, id: string): JobDetail {
  const ld = findJobPosting(html)
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const title = (ld?.title ? decodeHtmlEntities(ld.title) : null) ?? (h1 ? clean(h1[1]) : null) ?? "(untitled)"

  const addr = ld?.jobLocation?.address
  const country = typeof addr?.addressCountry === "string" ? addr.addressCountry : addr?.addressCountry?.name
  const location = [addr?.addressLocality, country].filter(Boolean).join(", ") || null

  const body = extractDivContent(html, "ck-content")
  return {
    id,
    title,
    company: ld?.hiringOrganization?.name ? decodeHtmlEntities(ld.hiringOrganization.name) : null,
    location,
    date: ld?.datePosted ?? null,
    deadline: ld?.validThrough ?? null,
    url: `${BASE_URL}/ad/${id}`,
    description: body ? htmlToText(body) : null,
  }
}

/**
 * Accept the `id` from search results ("<employer>/<year>/<slug>/<n>") or a
 * full academicpositions.com /ad/ URL. Any other host is rejected, so an
 * apply link on a third-party site never gets fetched as if it were this one.
 */
export function normalizeId(input: string): string | null {
  const trimmed = input.trim()
  if (/^[a-z0-9-]+\/\d{4}\/[a-z0-9-]+\/\d+\/?$/i.test(trimmed)) return trimmed.replace(/\/$/, "")
  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^(www\.)?academicpositions\.com\//i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!/^(www\.)?academicpositions\.com$/i.test(parsed.hostname)) return null
  const m = parsed.pathname.match(/^\/ad\/([a-z0-9-]+\/\d{4}\/[a-z0-9-]+\/\d+)\/?$/i)
  return m ? m[1] : null
}

/** Whether every whitespace-separated word of the query appears in the text (case-insensitive). */
export function matchesQuery(text: string, query: string | undefined): boolean {
  if (!query) return true
  const hay = text.toLowerCase()
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))
}
