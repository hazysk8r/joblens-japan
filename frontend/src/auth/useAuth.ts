import { useContext } from 'react';

import { AuthContext } from './authContext';
import type { AuthContextValue } from './authContext';

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (value === null) {
    throw new Error('useAuthはAuthProviderの中で使用してください。');
  }
  return value;
}
