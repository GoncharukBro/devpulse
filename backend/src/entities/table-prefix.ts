/**
 * Returns a prefixed table name using DB_TABLE_PREFIX env var.
 * Reads process.env directly because decorators execute at import time,
 * before the config singleton is initialized.
 * Default prefix: 'devpulse_'
 */
export function prefixedTable(name: string): string {
  const prefix = process.env.DB_TABLE_PREFIX ?? 'devpulse_';
  return `${prefix}${name}`;
}
