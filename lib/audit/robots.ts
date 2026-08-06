/**
 * Just enough robots.txt to answer one question: is this crawler allowed to
 * fetch this path?
 *
 * Deliberately not a complete implementation — no crawl-delay, no sitemap, no
 * host directives. It follows the parts of the spec that decide access:
 *
 *  - Records are grouped by consecutive `User-agent` lines; a group's rules
 *    apply to every agent named in that run.
 *  - An agent obeys the group naming it, and only falls back to `*` when no
 *    group names it. Group names match case-insensitively.
 *  - Within the matching group, the LONGEST matching rule wins. On an exact
 *    length tie, `Allow` beats `Disallow`.
 *  - `Disallow:` with an empty value allows everything.
 *  - `*` and `$` are supported in rule paths.
 *
 * The default is ALLOW. No robots.txt, an unreadable one, or no matching rule
 * all mean the crawler may fetch — that's what the spec says, and reporting a
 * site as blocked because it has no robots.txt would be wrong on most small
 * business sites.
 */

type Rule = { allow: boolean; path: string };
type Group = { agents: string[]; rules: Rule[] };

export function parseRobots(txt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  // A blank line doesn't end a group, but a Disallow following a User-agent
  // does mean the next User-agent starts a new one.
  let expectingAgents = false;

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      if (!current || !expectingAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
        expectingAgents = true;
      }
      current.agents.push(value.toLowerCase());
      continue;
    }

    if (field === 'allow' || field === 'disallow') {
      if (!current) continue; // rule before any user-agent — not ours to apply
      expectingAgents = false;
      current.rules.push({ allow: field === 'allow', path: value });
    }
  }

  return groups;
}

/** Turn a robots path pattern into a regex, honouring `*` and a trailing `$`. */
function toMatcher(pattern: string): RegExp {
  const anchoredEnd = pattern.endsWith('$');
  const body = anchoredEnd ? pattern.slice(0, -1) : pattern;
  const escaped = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}${anchoredEnd ? '$' : ''}`);
}

function groupFor(groups: Group[], agent: string): Group | null {
  const wanted = agent.toLowerCase();
  return (
    groups.find((g) => g.agents.includes(wanted)) ??
    groups.find((g) => g.agents.includes('*')) ??
    null
  );
}

/**
 * @param txt   robots.txt contents, or null when there isn't one.
 * @param agent Crawler token, e.g. "GPTBot".
 * @param path  Path being fetched; defaults to the site root.
 */
export function isCrawlerAllowed(txt: string | null, agent: string, path = '/'): boolean {
  if (!txt) return true;

  const group = groupFor(parseRobots(txt), agent);
  if (!group) return true;

  let decision: boolean | null = null;
  let winningLength = -1;

  for (const rule of group.rules) {
    // "Disallow:" with nothing after it is an explicit allow-all, and carries
    // no path length to compare with.
    if (rule.path === '') {
      if (!rule.allow && winningLength < 0) decision = true;
      continue;
    }

    if (!toMatcher(rule.path).test(path)) continue;

    const length = rule.path.length;
    if (length > winningLength || (length === winningLength && rule.allow)) {
      winningLength = length;
      decision = rule.allow;
    }
  }

  return decision ?? true;
}

/** True when robots.txt names the agent directly rather than only via `*`. */
export function isCrawlerNamed(txt: string | null, agent: string): boolean {
  if (!txt) return false;
  return parseRobots(txt).some((g) => g.agents.includes(agent.toLowerCase()));
}
