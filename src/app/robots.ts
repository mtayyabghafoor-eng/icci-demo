// E6: a private admin site, so every search engine and the named AI
// scrapers are asked to keep out entirely. No site map: there is nothing to
// list. The gatekeeper (proxy.ts) lets this file through without sign-in.
import type { MetadataRoute } from "next";

const AI_SCRAPERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "CCBot",
  "Google-Extended",
  "Applebot-Extended",
  "PerplexityBot",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "cohere-ai",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", disallow: "/" },
      { userAgent: AI_SCRAPERS, disallow: "/" },
    ],
  };
}
