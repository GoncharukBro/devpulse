import { YouTrackInstance } from '../../config/youtrack.config';
import { RateLimiter } from '../../common/utils/rate-limiter';
import { AppError } from '../../common/errors';
import {
  YouTrackProject,
  YouTrackUser,
  YouTrackIssue,
  YouTrackWorkItem,
  YouTrackActivity,
} from './youtrack.types';

const REQUEST_TIMEOUT = 30_000;
const MAX_RETRIES = 3;
const PAGE_SIZE = 100;

interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

const defaultLogger: Logger = {
  // eslint-disable-next-line no-console
  info: (msg) => console.log(msg),
  // eslint-disable-next-line no-console
  warn: (msg) => console.warn(msg),
  // eslint-disable-next-line no-console
  error: (msg) => console.error(msg),
};

export class YouTrackClient {
  private baseUrl: string;
  private token: string;
  private instanceName: string;
  private log: Logger;

  constructor(
    private instance: YouTrackInstance,
    private rateLimiter: RateLimiter,
    logger?: Logger,
  ) {
    this.baseUrl = instance.url.replace(/\/+$/, '');
    this.token = instance.token;
    this.instanceName = instance.name;
    this.log = logger ?? defaultLogger;
  }

  async request<T>(method: string, path: string, params?: Record<string, string>): Promise<T> {
    await this.rateLimiter.acquire();

    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const start = Date.now();

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        const response = await fetch(url.toString(), {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const elapsed = Date.now() - start;

        if (response.ok) {
          this.log.info(
            `[${this.instanceName}] ${method} ${path} → ${response.status} (${elapsed}ms)`,
          );
          return (await response.json()) as T;
        }

        if (response.status === 401 || response.status === 403) {
          this.log.error(
            `[${this.instanceName}] ${method} ${path} → ${response.status} (${elapsed}ms)`,
          );
          throw new AppError(502, 'YouTrack authentication failed');
        }

        if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
          const backoff = Math.pow(2, attempt) * 500;
          this.log.warn(
            `[${this.instanceName}] YouTrack retry: attempt ${attempt + 1}/${MAX_RETRIES} after ${response.status}`,
          );
          await new Promise((resolve) => setTimeout(resolve, backoff));
          lastError = new Error(`YouTrack responded with ${response.status}`);
          continue;
        }

        const body = await response.text();
        this.log.error(
          `[${this.instanceName}] ${method} ${path} → ${response.status} (${elapsed}ms)\n  URL: ${url.toString()}\n  Response: ${body}`,
        );
        throw new AppError(502, `YouTrack error: ${response.status}`);
      } catch (err) {
        if (err instanceof AppError) throw err;

        const error = err as Error;

        if (error.name === 'AbortError') {
          this.log.error(`[${this.instanceName}] ${method} ${path} → timeout (${REQUEST_TIMEOUT}ms)`);
          throw new AppError(504, 'YouTrack request timeout');
        }

        if (attempt < MAX_RETRIES) {
          const backoff = Math.pow(2, attempt) * 500;
          this.log.warn(
            `[${this.instanceName}] YouTrack retry: attempt ${attempt + 1}/${MAX_RETRIES} after error: ${error.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, backoff));
          lastError = error;
          continue;
        }

        lastError = error;
      }
    }

    this.log.error(`[${this.instanceName}] YouTrack unavailable: ${lastError?.message}`);
    throw new AppError(502, 'YouTrack is unavailable');
  }

  async requestAll<T>(
    method: string,
    path: string,
    params?: Record<string, string>,
  ): Promise<T[]> {
    const results: T[] = [];
    let skip = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const pageParams = { ...params, $top: String(PAGE_SIZE), $skip: String(skip) };
      const page = await this.request<T[]>(method, path, pageParams);

      if (!Array.isArray(page)) {
        this.log.warn(`[${this.instanceName}] Expected array from ${path}, got ${typeof page}`);
        break;
      }

      results.push(...page);

      if (page.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }

    return results;
  }

  async getProjects(): Promise<YouTrackProject[]> {
    return this.requestAll<YouTrackProject>('GET', '/api/admin/projects', {
      fields: 'id,name,shortName,description,archived,leader(login,name,email)',
    });
  }

  async getProjectMembers(projectId: string): Promise<YouTrackUser[]> {
    return this.requestAll<YouTrackUser>(
      'GET',
      `/api/admin/projects/${encodeURIComponent(projectId)}/team/users`,
      {
        fields: 'id,login,name,email,avatarUrl,banned',
      },
    );
  }

  async getIssues(query: string, fields: string): Promise<YouTrackIssue[]> {
    return this.requestAll<YouTrackIssue>('GET', '/api/issues', {
      query,
      fields,
    });
  }

  async getWorkItems(
    startDate: string,
    endDate: string,
    fields: string,
  ): Promise<YouTrackWorkItem[]> {
    return this.requestAll<YouTrackWorkItem>('GET', '/api/workItems', {
      startDate,
      endDate,
      fields,
    });
  }

  async getIssuesByIds(issueIds: string[], fields: string): Promise<YouTrackIssue[]> {
    if (issueIds.length === 0) return [];

    // YouTrack query syntax: "issue id: PROJ-1, PROJ-2, PROJ-3"
    const query = `issue id: ${issueIds.join(', ')}`;
    return this.getIssues(query, fields);
  }

  async getIssueActivities(issueId: string): Promise<YouTrackActivity[]> {
    return this.requestAll<YouTrackActivity>(
      'GET',
      `/api/issues/${encodeURIComponent(issueId)}/activities`,
      {
        fields: 'id,timestamp,field(id,name),added(name),removed(name)',
        categories: 'CustomFieldCategory',
      },
    );
  }
}
