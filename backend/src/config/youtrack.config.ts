export interface YouTrackInstance {
  id: string;
  name: string;
  url: string;
  token: string;
}

export function getYouTrackInstances(): YouTrackInstance[] {
  const instances: YouTrackInstance[] = [];
  const seen = new Set<string>();

  for (const key of Object.keys(process.env)) {
    const match = key.match(/^YOUTRACK_(\w+)_URL$/);
    if (!match) continue;

    const id = match[1].toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);

    const prefix = `YOUTRACK_${match[1]}`;
    const url = process.env[`${prefix}_URL`];
    const token = process.env[`${prefix}_TOKEN`];
    const name = process.env[`${prefix}_NAME`] || `YouTrack (${id})`;

    if (!url || !token) continue;

    instances.push({ id, name, url, token });
  }

  return instances;
}
