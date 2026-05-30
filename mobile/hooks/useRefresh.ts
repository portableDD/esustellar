import { useState, useCallback, useRef } from 'react';

/**
 * Hook that manages pull-to-refresh state.
 * Pass the returned `refreshing` and `onRefresh` to a ScrollView/FlatList RefreshControl.
 *
 * @param fetchFn - async function to call on refresh
 */
export function useRefresh(fetchFn: () => Promise<void>) {
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  const onRefresh = useCallback(async () => {
    if (refreshingRef.current) return;

    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await fetchFn();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [fetchFn]);

  return { refreshing, onRefresh };
}
