import { describe, expect, test } from 'bun:test'
import { RssNewsFeedParser } from './feeds'

const source = { name: 'Test Feed', url: 'https://example.com/feed.xml' }

describe('RssNewsFeedParser', () => {
  test('parses RSS items with numeric entities', () => {
    const stories = new RssNewsFeedParser().parse(
      source,
      `
      <rss><channel><item>
        <title>Markets &#x26; chips rally</title>
        <description><![CDATA[Stocks &amp; semis rise]]></description>
        <pubDate>Thu, 02 Jan 2025 03:04:05 GMT</pubDate>
        <link>https://example.com/story</link>
      </item></channel></rss>
    `,
    )

    expect(stories).toHaveLength(1)
    expect(stories[0]?.headline).toBe('Markets & chips rally')
    expect(stories[0]?.summary).toBe('Stocks & semis rise')
    expect(stories[0]?.url).toBe('https://example.com/story')
  })

  test('parses Atom entries with href links and updated dates', () => {
    const stories = new RssNewsFeedParser().parse(
      source,
      `
      <feed><entry>
        <atom:title>Fed update</atom:title>
        <updated>2025-01-02T03:04:05Z</updated>
        <link href="https://example.com/atom-story" />
      </entry></feed>
    `,
    )

    expect(stories).toHaveLength(1)
    expect(stories[0]?.headline).toBe('Fed update')
    expect(stories[0]?.url).toBe('https://example.com/atom-story')
    expect(stories[0]?.publishedAt).toBe('2025-01-02T03:04:05.000Z')
  })
})
