import { useContext } from 'react';

import { AuthContext } from './authContext';
import type { AuthContextValue } from './authContext';

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (value === null) {
    throw new Error('useAuth는 AuthProvider 안에서 사용해야 합니다.');
  }
  return value;
}
