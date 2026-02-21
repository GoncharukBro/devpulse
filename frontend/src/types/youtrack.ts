export interface YouTrackInstance {
  id: string;
  name: string;
  url: string;
}

export interface YouTrackProject {
  id: string;
  name: string;
  shortName: string;
  description?: string;
  archived: boolean;
  leader?: {
    login: string;
    name: string;
    email?: string;
  };
}

export interface YouTrackUser {
  id: string;
  login: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  banned: boolean;
}
