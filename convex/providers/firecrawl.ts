type FirecrawlScrapeResponse = {
  success?: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      sourceURL?: string;
      title?: string;
    };
  };
};

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

export async function scrapeOfficialAccessibilityPage(url: string) {
  const apiKey = requiredEnvironmentValue("FIRECRAWL_API_KEY");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        maxAge: 21_600_000,
        blockAds: true,
        removeBase64Images: true,
        storeInCache: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Firecrawl request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as FirecrawlScrapeResponse;
    const markdown = payload.data?.markdown?.trim();

    if (!payload.success || !markdown) {
      throw new Error("Firecrawl returned no usable page content");
    }

    return {
      markdown,
      sourceUrl: payload.data?.metadata?.sourceURL ?? url,
      title: payload.data?.metadata?.title ?? "Official accessibility update",
    };
  } finally {
    clearTimeout(timeout);
  }
}
