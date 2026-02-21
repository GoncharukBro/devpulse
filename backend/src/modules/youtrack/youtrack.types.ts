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

export interface YouTrackIssue {
  id: string;
  idReadable: string;
  summary: string;
  created: number;
  resolved?: number;
  updatedDate?: number;
  customFields: YouTrackCustomField[];
}

export interface YouTrackCustomField {
  name: string;
  value: YouTrackCustomFieldValue | YouTrackCustomFieldValue[] | string | number | null;
}

export interface YouTrackCustomFieldValue {
  name?: string;
  login?: string;
  text?: string;
  minutes?: number;
  presentation?: string;
}

export interface YouTrackWorkItem {
  id: string;
  date: number;
  duration: {
    minutes: number;
    presentation?: string;
  };
  type?: {
    name: string;
  };
  issue: {
    id: string;
    idReadable: string;
    summary: string;
  };
  author: {
    login: string;
    name: string;
  };
}

export interface YouTrackActivity {
  id: string;
  timestamp: number;
  field: {
    id: string;
    name: string;
  };
  added: Array<{ name: string }> | null;
  removed: Array<{ name: string }> | null;
}
