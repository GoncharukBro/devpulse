export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  roles: string[];
}
