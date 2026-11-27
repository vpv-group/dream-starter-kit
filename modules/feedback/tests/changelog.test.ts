import { describe, expect, it } from "vitest";

import { buildRss } from "../src/server/changelog-routes";

describe("changelog RSS", () => {
  const xml = buildRss({
    siteUrl: "https://app.example.com/",
    title: "Changelog",
    description: "Updates & fixes",
    entries: [
      {
        id: 1,
        title: "Dark mode <beta> & more",
        slug: "dark-mode",
        type: "new",
        excerpt: "It's here — finally.",
        body: { root: {} },
        publishedAt: "2026-11-20T10:00:00.000Z",
        createdAt: "2026-11-19T10:00:00.000Z",
        labels: [{ name: "Mobile" }, 7],
        heroImage: {
          url: "/media/hero.png",
          mimeType: "image/png",
          filesize: 1234,
        },
      },
    ],
    bodyHtml: () => "<p>Body ]]> with CDATA end</p>",
  });

  it("is RSS 2.0 with absolute links and a self link", () => {
    expect(
      xml.startsWith(
        '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"',
      ),
    ).toBe(true);
    expect(xml).toContain(
      "<link>https://app.example.com/changelog/dark-mode</link>",
    );
    expect(xml).toContain(
      '<guid isPermaLink="true">https://app.example.com/changelog/dark-mode</guid>',
    );
    expect(xml).toContain(
      'href="https://app.example.com/api/mod/feedback/changelog/rss.xml" rel="self"',
    );
  });

  it("escapes titles and splits CDATA safely", () => {
    expect(xml).toContain("<title>Dark mode &lt;beta&gt; &amp; more</title>");
    expect(xml).toContain("<description>Updates &amp; fixes</description>");
    expect(xml).toContain("]]]]><![CDATA[>");
  });

  it("adds the type and labels as categories, the date and the hero image", () => {
    expect(xml).toContain(
      "<category>New</category><category>Mobile</category>",
    );
    expect(xml).toContain("<pubDate>Fri, 20 Nov 2026 10:00:00 GMT</pubDate>");
    expect(xml).toContain(
      '<enclosure url="https://app.example.com/media/hero.png" type="image/png" length="1234"/>',
    );
  });
});
