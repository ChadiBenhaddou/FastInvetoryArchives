import { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { AppContext } from './app/AppContext';
import { back, isHome, useRoute } from './app/nav';
import { I18nProvider } from './i18n';
import { getProfile, saveProfile } from './lib/settings';
import type { Profile } from './lib/types';
import AdminScreen from './screens/AdminScreen';
import BoxScreen from './screens/BoxScreen';
import BoxesScreen from './screens/BoxesScreen';
import CaptureScreen from './screens/CaptureScreen';
import ExportScreen from './screens/ExportScreen';
import HistoryScreen from './screens/HistoryScreen';
import HomeScreen from './screens/HomeScreen';
import NewBoxScreen from './screens/NewBoxScreen';
import SetupScreen from './screens/SetupScreen';

export default function App() {
    const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
    const route = useRoute();

    useEffect(() => {
        getProfile().then(setProfile);
        // Android back button: previous screen, or leave the app from the home screen.
        const handle = CapApp.addListener('backButton', () => (isHome() ? CapApp.exitApp() : back()));
        return () => void handle.then((h) => h.remove());
    }, []);

    if (profile === undefined) return null;
    if (profile === null) return <SetupScreen onDone={setProfile} />;

    async function updateProfile(p: Profile) {
        await saveProfile(p);
        setProfile(p);
    }

    let screen;
    switch (route.name) {
        case 'newBox': screen = <NewBoxScreen />; break;
        case 'capture': screen = <CaptureScreen key={route.code} code={route.code} />; break;
        case 'box': screen = <BoxScreen key={route.code} code={route.code} />; break;
        case 'boxes': screen = <BoxesScreen />; break;
        case 'export': screen = <ExportScreen />; break;
        case 'history': screen = <HistoryScreen />; break;
        case 'admin': screen = <AdminScreen />; break;
        default: screen = <HomeScreen />;
    }

    return (
        <AppContext.Provider value={{ profile, updateProfile }}>
            <I18nProvider lang={profile.language}>{screen}</I18nProvider>
        </AppContext.Provider>
    );
}
