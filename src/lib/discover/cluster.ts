import { extractEntities } from './entities';

export interface DiscoveryArticle {
  title: string;
  url: string;
  sourceDomain: string;
  publishedAt: string;
  locale: string;
}

export interface Cluster {
  clusterKey: string;
  entities: string[];        // ordered by frequency, most common first
  articles: DiscoveryArticle[];
  locales: string[];         // distinct locales present
  domains: string[];         // distinct source domains present
}

// ----------------------------------------------------------------
// Jaccard similarity between two entity sets
// ----------------------------------------------------------------
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// ----------------------------------------------------------------
// Union-Find (path compression)
// ----------------------------------------------------------------
function makeUnionFind(n: number) {
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]);
    return parent[i];
  }

  function union(i: number, j: number): void {
    parent[find(i)] = find(j);
  }

  return { find, union };
}

// ----------------------------------------------------------------
// Generate a stable cluster key from the top entities
// Stability means the same cluster produces the same key across runs.
// ----------------------------------------------------------------
function makeClusterKey(topEntities: string[]): string {
  return topEntities
    .slice(0, 3)
    .map((e) => e.toLowerCase().replace(/\s+/g, '-'))
    .sort()
    .join('_')
    .slice(0, 80); // hard cap to stay within DB column comfort zone
}

// ----------------------------------------------------------------
// Main clustering function
// ----------------------------------------------------------------
export function clusterArticles(
  articles: DiscoveryArticle[],
  minOverlap: number = 0.25
): Cluster[] {
  if (articles.length === 0) return [];

  // Extract entities once per article
  const entitySets = articles.map((a) => new Set(extractEntities(a.title)));

  // Build union-find groups
  const { find, union } = makeUnionFind(articles.length);

  for (let i = 0; i < articles.length; i++) {
    if (entitySets[i].size === 0) continue;
    for (let j = i + 1; j < articles.length; j++) {
      if (entitySets[j].size === 0) continue;
      if (jaccard(entitySets[i], entitySets[j]) >= minOverlap) {
        union(i, j);
      }
    }
  }

  // Group articles by root
  const groups = new Map<number, number[]>();
  for (let i = 0; i < articles.length; i++) {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  // Build Cluster objects
  const clusters: Cluster[] = [];

  for (const indices of groups.values()) {
    if (indices.length < 2) continue; // drop singletons

    const clusterArticles = indices.map((i) => articles[i]);

    // Count entity frequency across the cluster
    const freq = new Map<string, number>();
    for (const i of indices) {
      for (const entity of entitySets[i]) {
        freq.set(entity, (freq.get(entity) ?? 0) + 1);
      }
    }

    // Sort entities: highest frequency first; break ties alphabetically
    const sortedEntities = [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([e]) => e);

    const locales  = [...new Set(clusterArticles.map((a) => a.locale))];
    const domains  = [...new Set(clusterArticles.map((a) => a.sourceDomain))];
    const clusterKey = makeClusterKey(sortedEntities);

    clusters.push({
      clusterKey,
      entities: sortedEntities.slice(0, 10),
      articles: clusterArticles,
      locales,
      domains,
    });
  }

  // Largest clusters first
  return clusters.sort((a, b) => b.articles.length - a.articles.length);
}
