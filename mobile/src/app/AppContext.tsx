import { createContext, useContext } from 'react';
import type { Profile } from '../lib/types';

export interface AppState {
    profile: Profile;
    updateProfile(profile: Profile): Promise<void>;
}

export const AppContext = createContext<AppState>(null as unknown as AppState);
export const useApp = () => useContext(AppContext);
