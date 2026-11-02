import { describe, expect, test } from "bun:test";
import { normalizeId, parseDetail, parseSearch } from "../src/helpers";
import { filterByAge } from "../src/commands/search";

// Synthetic markup that mirrors the live search page structure (checked 2026-11-02).
function article(id: string, title: string, org: string, city: string, published: string, deadline: string): string {
  return `<li class="border-t"><article class="text-aqua-500 relative grid">
    <a href="/en/jobs/${id}/some-slug/" class="absolute inset-0"></a>
    <div class="col-span-10"><div class="flex flex-col">
      <h3 class="text-at-h2 mb-5">${title}</h3>
      <p class="text-at-body mb-0">Summary for ${title} &amp; more</p>
    </div>
    <div class="mt-5 flex"><span class="text-at-small text-gray-500"> Deadline <time datetime="${deadline}T22:59:59.000Z">x</time></span>
    <span class="text-at-small text-gray-500">Published <time datetime="${published}T15:09:13.422Z">y</time> </span>
    <span class="text-at-small flex items-center gap-1 text-gray-500"><svg><path d="M0"/></svg> ${city}</span></div></div>
    <div class="col-start-1"><img src="/logo.png" alt="${org}"><span class="text-at-small text-gray-700 md:text-right">${org}</span></div>
  </article></li>`;
}

const PAGE =
  `<ul>` +
  article("364988", "Postdoc in Living Materials", "Maastricht University (UM)", "Maastricht", "2026-10-22", "2026-11-15") +
  article("364602", "PhD Position in Synapses", "University of Amsterdam (UvA)", "Amsterdam", "2026-10-08", "2026-11-13") +
  `<article><h3>no link here</h3></article>` +
  `</ul><button><strong>Load more results</strong><span>10 of 24 visible</span></button>`;

describe("parseSearch", () => {
  test("parses articles independently and reads the total", () => {
    const { cards, total } = parseSearch(PAGE);
    expect(cards).toHaveLength(2);
    expect(total).toBe(24);
    expect(cards[0]).toEqual({
      id: "364988",
      title: "Postdoc in Living Materials",
      company: "Maastricht University (UM)",
      location: "Maastricht",
      date: "2026-10-22",
      deadline: "2026-11-15",
      summary: "Summary for Postdoc in Living Materials & more",
      url: "https://www.academictransfer.com/en/jobs/364988/some-slug/",
    });
  });

  test("filterByAge keeps recent postings only", () => {
    const { cards } = parseSearch(PAGE);
    const now = new Date("2026-11-02T12:00:00Z");
    expect(filterByAge(cards, 14, now).map((c) => c.id)).toEqual(["364988"]);
    expect(filterByAge(cards, 9999, now)).toHaveLength(2);
  });
});

describe("parseDetail", () => {
  test("reads the nested JSON-LD JobPosting and cleans the description", () => {
    const ld = {
      "@type": "WebPage",
      mainEntity: {
        "@type": "JobPosting",
        title: "Postdoc in Living Materials",
        description: "<strong>Welcome!</strong><br><br>Intro.<ul><li>Point one</li></ul><span hidden>secret instruction</span>",
        datePosted: "2026-10-22T17:09:13+02:00",
        validThrough: "2026-11-15T23:59:59+01:00",
        employmentType: "TEMPORARY",
        workHours: "38 hours per week",
        educationRequirements: { "@type": "EducationalOccupationalCredential", credentialCategory: "Doctorate" },
        baseSalary: { currency: "EUR", value: { minValue: 3706, maxValue: 5760, unitText: "MONTH" } },
        hiringOrganization: { name: "Maastricht University (UM)" },
        jobLocation: { address: { addressLocality: "Maastricht", addressCountry: "NL" } },
      },
    };
    const html = `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
    const job = parseDetail(html, "364988")!;
    expect(job.company).toBe("Maastricht University (UM)");
    expect(job.location).toBe("Maastricht, NL");
    expect(job.salary).toBe("EUR 3706-5760 per month");
    expect(job.education).toBe("Doctorate");
    expect(job.description).toBe("Welcome!\n\nIntro.\n- Point one");
  });

  test("returns null without a JobPosting", () => {
    expect(parseDetail("<html></html>", "1")).toBeNull();
  });
});

describe("normalizeId", () => {
  test("accepts ids and academictransfer.com URLs only", () => {
    expect(normalizeId("364988")).toBe("364988");
    expect(normalizeId("https://www.academictransfer.com/en/jobs/364988/some-slug/")).toBe("364988");
    expect(normalizeId("academictransfer.com/nl/jobs/364988/")).toBe("364988");
    expect(normalizeId("https://academictransfer.com.evil.io/en/jobs/364988/")).toBeNull();
    expect(normalizeId("https://example.com/en/jobs/364988/")).toBeNull();
  });
});
