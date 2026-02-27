import { getYouTrackInstances, YouTrackInstance } from '../../config/youtrack.config';
import { RateLimiter } from '../../common/utils/rate-limiter';
import { NotFoundError } from '../../common/errors';
import { YouTrackClient } from './youtrack.client';
import { YouTrackProject, YouTrackUser } from './youtrack.types';
import { Logger } from '../../common/types/logger';

const RATE_LIMIT_INTERVAL = 200;

export class YouTrackService {
  private instances: YouTrackInstance[];
  private clients = new Map<string, YouTrackClient>();
  private rateLimiters = new Map<string, RateLimiter>();
  private log: Logger | undefined;

  constructor(logger?: Logger) {
    this.instances = getYouTrackInstances();
    this.log = logger;
  }

  getInstances(): Array<{ id: string; name: string; url: string }> {
    return this.instances.map(({ id, name, url }) => ({ id, name, url }));
  }

  getClient(instanceId: string): YouTrackClient {
    const existing = this.clients.get(instanceId);
    if (existing) return existing;

    const instance = this.instances.find((i) => i.id === instanceId);
    if (!instance) {
      throw new NotFoundError(`YouTrack instance not found: ${instanceId}`);
    }

    if (!this.rateLimiters.has(instanceId)) {
      this.rateLimiters.set(instanceId, new RateLimiter(RATE_LIMIT_INTERVAL));
    }

    const client = new YouTrackClient(
      instance,
      this.rateLimiters.get(instanceId)!,
      this.log,
    );
    this.clients.set(instanceId, client);
    return client;
  }

  async getProjects(instanceId: string): Promise<YouTrackProject[]> {
    return this.getClient(instanceId).getProjects();
  }

  async getProjectMembers(instanceId: string, projectId: string): Promise<YouTrackUser[]> {
    return this.getClient(instanceId).getProjectMembers(projectId);
  }
}

let serviceInstance: YouTrackService | undefined;

export function getYouTrackService(logger?: Logger): YouTrackService {
  if (!serviceInstance) {
    serviceInstance = new YouTrackService(logger);
  }
  return serviceInstance;
}
