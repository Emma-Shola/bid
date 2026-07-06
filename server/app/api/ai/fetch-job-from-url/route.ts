import dns from "node:dns/promises";
import net from "node:net";
import { UserRole } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import * as cheerio from "cheerio";
import { getAuthUser } from "@/lib/rbac";
import { jsonError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeWhitespace } from "@/lib/resume/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  url: z.string().trim().min(1).max(2000)
});

const ExtractedJobSchema = z
  .object({
    company: z.string(),
    jobTitle: z.string()
  })
  .strict();

let client: OpenAI | null = null;

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  // Without an explicit timeout, a slow upstream call can outlast Railway's
  // own proxy timeout, which then kills the connection and hands the client
  // a raw non-JSON response ("Unexpected server response") instead of a
  // clean error — failing fast here lets the catch block below produce a
  // proper JSON error well within that window.
  client ??= new OpenAI({ apiKey, timeout: 25_000 });
  return client;
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "metadata.google.internal"]);

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80")) return true;
    return false;
  }
  return false;
}

// Blocks obviously internal/private targets before we let the server fetch a
// bidder-supplied URL — this endpoint would otherwise be a straightforward
// SSRF vector (fetch http://169.254.169.254/... or an internal service).
async function assertUrlIsSafeToFetch(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("That doesn't look like a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http/https URLs are supported.");
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new Error("That URL can't be fetched.");
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("That URL can't be fetched.");
    return url;
  }

  const records = await dns.lookup(hostname, { all: true }).catch(() => []);
  if (records.length === 0) {
    throw new Error("Could not resolve that URL's host.");
  }
  if (records.some((record) => isPrivateIp(record.address))) {
    throw new Error("That URL can't be fetched.");
  }

  return url;
}

function extractVisibleText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, footer, header, iframe").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

async function fetchPageText(initialUrl: URL): Promise<string> {
  let currentUrl = initialUrl;

  for (let redirects = 0; redirects < 5; redirects++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetch(currentUrl.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml"
        }
      });
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("The job board redirected without a destination.");
      }
      const nextUrl = new URL(location, currentUrl);
      currentUrl = await assertUrlIsSafeToFetch(nextUrl.toString());
      continue;
    }

    if (!response.ok) {
      throw new Error(`The job board returned an error (${response.status}). Try pasting the text instead.`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      throw new Error("That URL didn't return a web page. Try pasting the text instead.");
    }

    const html = await response.text();
    // Cap raw HTML before parsing — a handful of job boards ship megabytes of
    // inline state/script data that cheerio would otherwise have to parse in
    // full just to have it discarded a moment later.
    return extractVisibleText(html.slice(0, 1_000_000));
  }

  throw new Error("Too many redirects while fetching that URL.");
}

function buildPrompt(text: string) {
  return [
    "Extract the hiring company name and job title from this job posting page text.",
    "Return strict JSON only, nothing else.",
    "company: the actual hiring company's name only. If the posting is clearly placed by a staffing/recruiting agency on behalf of a named end client, use the end client's name instead of the agency's.",
    "jobTitle: the position/role title only — no location, employment type, or clearance/qualifier text appended.",
    "If you cannot confidently determine a field, return an empty string for it. Never guess or invent a company name or title that isn't actually present in the text.",
    "",
    "PAGE TEXT:",
    text.slice(0, 20_000)
  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const limited = await rateLimit(req, { key: "ai:fetch-job-from-url", limit: 15, windowMs: 60_000 });
    if (limited) return limited;

    const auth = await getAuthUser(req);
    if (!auth) return jsonError("Unauthorized", 401);
    if (auth.user.role !== UserRole.bidder) {
      return jsonError("Only bidders can fetch job details from a URL", 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonError("Enter a job posting URL first", 422, parsed.error.flatten());
    }

    let safeUrl: URL;
    try {
      safeUrl = await assertUrlIsSafeToFetch(parsed.data.url);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Invalid URL", 422);
    }

    let pageText: string;
    try {
      pageText = await fetchPageText(safeUrl);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Failed to fetch that URL", 422);
    }

    if (!pageText || pageText.length < 50) {
      return jsonError(
        "Couldn't read enough content from that page — it may require sign-in or JavaScript. Try pasting the text instead.",
        422
      );
    }

    const openai = getClient();
    if (!openai) {
      return jsonError("OPENAI_API_KEY is required for this feature", 500);
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_INTERVIEW_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0,
      instructions:
        "You extract structured facts from job posting pages. Return only strict JSON matching the schema. Never invent a company name or job title that isn't in the text.",
      input: buildPrompt(pageText),
      text: {
        format: zodTextFormat(ExtractedJobSchema, "extracted_job")
      }
    });

    const raw = normalizeWhitespace(response.output_text || "");
    if (!raw) {
      return jsonError("Could not extract details from that page", 500);
    }

    const extracted = ExtractedJobSchema.parse(JSON.parse(raw));

    return NextResponse.json({
      data: {
        company: extracted.company,
        jobTitle: extracted.jobTitle,
        jobDescription: pageText.slice(0, 20_000)
      }
    });
  } catch (error) {
    console.error("fetch-job-from-url POST failed", error);
    return jsonError("Failed to fetch job details from that URL", 500);
  }
}
