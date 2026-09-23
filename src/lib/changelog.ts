// Release notes are plain "- message" bullets under a "## What's changed" heading (built by
// the release workflow from commit messages) — this just strips the heading/full-changelog
// noise down to the bullets themselves. Also tolerates GitHub's own auto-generated format
// ("* thing by @user in <url>") in case that's ever used again.
export function extractNotes(body: string): string[] {
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("*") || l.startsWith("-"))
    .map((l) => l.replace(/^[-*]\s*/, "").replace(/\s+by\s+@[\w-]+.*$/i, "").trim())
    .filter((l) => l.length > 0 && !/^full changelog/i.test(l))
    .slice(0, 8);
}
