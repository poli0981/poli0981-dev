// `astro:content` for unit tests: collections are whatever the test registered.

export interface StubEntry {
  id: string;
  collection?: string;
  data: Record<string, unknown>;
  body?: string;
}

const collections = new Map<string, StubEntry[]>();

export function setCollection(name: string, entries: StubEntry[]): void {
  collections.set(
    name,
    entries.map((entry) => ({ collection: name, ...entry })),
  );
}

export function clearCollections(): void {
  collections.clear();
}

export async function getCollection(
  name: string,
  filter?: (entry: StubEntry) => unknown,
): Promise<StubEntry[]> {
  const entries = collections.get(name) ?? [];
  return filter ? entries.filter((entry) => filter(entry)) : [...entries];
}

export const defineCollection = <T>(config: T): T => config;
