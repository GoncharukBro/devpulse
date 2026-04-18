export const config = {
  authEnabled: import.meta.env.VITE_AUTH_ENABLED !== 'false',
  api: {
    baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3100/api',
  },
  keycloak: {
    url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8083',
    realm: import.meta.env.VITE_KEYCLOAK_REALM || 'office',
    clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'devpulse-frontend',
    redirectUri: `${window.location.origin}/devpulse/login`,
  },
} as const;
