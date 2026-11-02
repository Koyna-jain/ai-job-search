# AcademicTransfer - URL reference

Recorded 2026-11-02. Update this file when the site's markup changes.

## Access

- `https://www.academictransfer.com/robots.txt`: `User-agent: *` → `Allow: /`, `Disallow: /account/`,
  `Disallow: /apply/`, **`Crawl-delay: 10`**. AI search/reference agents are explicitly allowed;
  AI training crawlers are not.
- `https://api.academictransfer.com/robots.txt`: `Disallow: /` for all agents, and the API
  answers 401 without credentials. **Not used.**

## Endpoints

| Purpose | URL | Notes |
|---|---|---|
| Search | `https://www.academictransfer.com/en/jobs/?q=<keywords>` | Nuxt SSR; first 10 results only. `&page=2` is ignored; further results load from the API |
| Job page | `https://www.academictransfer.com/en/jobs/<id>/` | slug optional; full posting in JSON-LD |

The query matches title, text, employer and city, so a city in `q` narrows by place.

## Search result anchors

Each result is an `<article>`; the CLI splits on `<article` and parses each chunk on its own.

| Field | Anchor |
|---|---|
| id / url | `<a href="/en/jobs/<id>/<slug>/" class="absolute inset-0 ...">` |
| title | `<h3 class="text-at-h2 ...">` |
| summary | first `<p class="text-at-body ...">` |
| deadline | `Deadline <time datetime="...Z">` |
| published | `Published <time datetime="...Z">` |
| location | `<span class="text-at-small flex items-center gap-1 text-gray-500">City</span>` |
| employer | `<span class="text-at-small text-gray-700 md:text-right">Name</span>` (fallback: logo `alt`) |
| total | `<span>10 of 24 visible</span>` on the "Load more results" button |

## Job page anchors

`<script type="application/ld+json">` holds a `WebPage` whose `mainEntity` is the
`JobPosting`: `title`, `description` (full HTML), `datePosted`, `validThrough`,
`employmentType`, `workHours`, `educationRequirements.credentialCategory`,
`baseSalary.{currency, value.minValue/maxValue/unitText}`, `hiringOrganization.name`,
`jobLocation.address.{addressLocality, addressCountry}`, `identifier.value` (= id).
