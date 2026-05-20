/**
 * PromptStore — loads versioned prompts from prompt_templates + prompt_versions
 * with an in-memory cache. Falls back to hardcoded defaults when no active
 * version is registered.
 *
 * Design notes:
 *  - Cache is keyed by template name. TTL default 5 minutes — long enough that
 *    a sustained inference burst doesn't hammer the DB, short enough that a
 *    prompt rollback is visible across the fleet inside 5 min.
 *  - Read-only inside ai-gateway. Mutations go through a separate admin API
 *    (out of scope here — prompt management is a Sprint 9+ feature).
 *  - Falls back gracefully: if the DB is unreachable, we return the hardcoded
 *    default so the AI gateway stays available. We log the fallback at WARN.
 *  - Substitution uses simple {{var}} mustache-style replacement. Variables
 *    not in the payload are replaced with empty string (deliberate — a missing
 *    field shouldn't crash a brief generation).
 */
import type { RoomardPool } from '@roomard/db';
import { createLogger } from '@roomard/logger';

const log = createLogger({ name: 'ai-gateway.prompt-store' });

export interface PromptVersion {
  id: string;
  templateId: string;
  templateName: string;
  versionLabel: string;
  modelId: string;
  systemPrompt: string | null;
  userPrompt: string;
  parameters: Record<string, unknown>;
}

export interface PromptStoreConfig {
  /** Cache TTL in milliseconds. Default 5 minutes. */
  cacheTtlMs?: number;
}

interface CacheEntry {
  version: PromptVersion | null; // null = no active version registered in DB
  loadedAt: number;
}

export class PromptStore {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;

  constructor(
    private readonly pool: RoomardPool,
    cfg: PromptStoreConfig = {},
  ) {
    this.ttlMs = cfg.cacheTtlMs ?? 5 * 60 * 1000;
  }

  /**
   * Resolve the active prompt version for a template name.
   * Returns null if no active version exists — caller should use its hardcoded
   * default in that case, which is the safe initial state during bootstrap.
   */
  async getActive(templateName: string): Promise<PromptVersion | null> {
    const cached = this.cache.get(templateName);
    if (cached && Date.now() - cached.loadedAt < this.ttlMs) {
      return cached.version;
    }
    try {
      const { rows } = await this.pool.query<{
        id: string;
        template_id: string;
        template_name: string;
        version_label: string;
        model_id: string;
        system_prompt: string | null;
        user_prompt: string;
        parameters: Record<string, unknown>;
      }>(
        `SELECT v.id, v.template_id, t.name AS template_name,
                v.version_label, v.model_id, v.system_prompt, v.user_prompt, v.parameters
         FROM prompt_versions v
         JOIN prompt_templates t ON t.id = v.template_id
         WHERE t.name = $1 AND v.is_active = true
         LIMIT 1`,
        [templateName],
      );
      const version: PromptVersion | null =
        rows.length > 0
          ? {
              id: rows[0]!.id,
              templateId: rows[0]!.template_id,
              templateName: rows[0]!.template_name,
              versionLabel: rows[0]!.version_label,
              modelId: rows[0]!.model_id,
              systemPrompt: rows[0]!.system_prompt,
              userPrompt: rows[0]!.user_prompt,
              parameters: rows[0]!.parameters ?? {},
            }
          : null;
      this.cache.set(templateName, { version, loadedAt: Date.now() });
      return version;
    } catch (err) {
      // DB unreachable — log and return null so caller falls back to its
      // hardcoded default. We do NOT cache the failure: next call retries.
      log.warn(
        { err, templateName },
        'prompt store DB lookup failed — falling back to hardcoded default',
      );
      return null;
    }
  }

  /** Clear the cache (for tests, prompt admin operations). */
  invalidate(): void {
    this.cache.clear();
  }
}

/**
 * Substitute {{variable}} placeholders in a prompt template with values from
 * `vars`. Unknown variables become empty string (deliberate — a missing
 * field shouldn't crash inference).
 */
export function substitute(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g, (_, key: string) => {
    const value = lookupDotted(vars, key);
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  });
}

function lookupDotted(obj: Record<string, unknown>, dotted: string): unknown {
  const parts = dotted.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}
