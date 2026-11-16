import { useEffect, useState, useCallback } from 'react';
import { AppUpdateManager, UpdateCheckResult } from '../services/appUpdateManager';

export function useAppUpdate() {
  const [state, setState] = useState(() => AppUpdateManager.getState());

  useEffect(() => {
    return AppUpdateManager.subscribe(setState);
  }, []);

  const checkForUpdates = useCallback(async (): Promise<UpdateCheckResult> => {
    return AppUpdateManager.checkForUpdates(false);
  }, []);

  const applyUpdate = useCallback(async (): Promise<void> => {
    return AppUpdateManager.applyUpdate();
  }, []);

  return {
    ...state,
    checkForUpdates,
    applyUpdate,
  };
}
