# AcademicPositions - URL reference

Recorded 2026-11-02. Update this file when the site's markup changes.

## Access

- `robots.txt`: `User-Agent: *` → `Allow: /`; `Content-signal: search=yes,ai-train=no`.
- No login needed for listings or job ads.
- Cloudflare in front: paginated listing URLs (`?page=2` and up) and occasional bursts get a
  "Just a moment..." challenge (HTTP 403). The CLI reports this and stops; it does not solve
  or evade the challenge.

## Endpoints

| Purpose | URL | Notes |
|---|---|---|
| Field listing | `https://academicpositions.com/jobs/field/<slug>` | 30 cards, server-rendered |
| Country listing | `https://academicpositions.com/jobs/country/<slug>` | same markup |
| Position listing | `https://academicpositions.com/jobs/position/<slug>` | `phd`, `post-doc`, `researcher`, `associate-professor`, `professor` |
| Job ad | `https://academicpositions.com/ad/<employer>/<year>/<slug>/<id>` | numeric id alone does not resolve (404) |
| Keyword search | `https://academicpositions.com/find-jobs?search=...` | **not used**: results load client-side via Livewire |

Unknown slugs return 200 with no cards or 404. City listings (`/jobs/country/germany/<city>`)
returned jobs from other places when tested, so the CLI does not offer them.

## Listing card anchors

Each card starts with `class="card shadow-sm mb-4 mb-md-4 job-list-item"`; the CLI splits on
`job-list-item` and parses each chunk on its own.

| Field | Anchor |
|---|---|
| id / url | `<a href="/ad/<employer>/<year>/<slug>/<id>" ... class="... job-link">` |
| title | `<h4>` inside that link |
| summary | `<p class="text-muted">` inside that link |
| employer | `<a href="https://academicpositions.com/employer/...">NAME</a>` |
| location | `<div class="job-locations ...">` (city and country links) |
| posted | text after `<i class="fe fe-calendar"></i>`: `Published 3 weeks ago` |
| position type | `<a href="https://academicpositions.com/jobs/position/...">` text |

## Job ad anchors

- JSON-LD `<script type="application/ld+json">` with `@type: JobPosting`: `title`,
  `datePosted`, `validThrough` (deadline), `hiringOrganization.name`,
  `jobLocation.address.addressLocality` / `addressCountry`. Its `description` is only the
  short summary.
- Full text: `<div class="editor ck-content ..." id="editor">`.
