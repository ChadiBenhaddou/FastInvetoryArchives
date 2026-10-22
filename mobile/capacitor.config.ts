import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.archiveinventory.capture',
    appName: 'Inventaire Archives',
    webDir: 'dist',
    // No server.url: the UI is always loaded from inside the APK.
    android: {
        allowMixedContent: false,
        captureInput: true,
        webContentsDebuggingEnabled: false,
    },
};

export default config;
