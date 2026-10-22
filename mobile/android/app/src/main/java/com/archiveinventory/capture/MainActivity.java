package com.archiveinventory.capture;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ArchiveNativePlugin.class);
        super.onCreate(savedInstanceState);
        // Agents shoot continuously: the screen must not go to sleep between boxes.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
