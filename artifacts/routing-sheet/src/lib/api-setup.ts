import { setAuthTokenGetter } from '@workspace/api-client-react';

export function setupApiClient() {
  setAuthTokenGetter(() => {
    return localStorage.getItem('auth_token');
  });
}
