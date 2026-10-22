package com.archiveinventory.capture;

import android.Manifest;
import android.media.MediaScannerConnection;
import android.os.Build;
import android.os.Environment;
import android.os.StatFs;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;
import java.util.zip.Deflater;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/**
 * Native helpers for the export: the ZIP is streamed photo by photo (an export can
 * be several GB, far too large for the WebView's memory) and then made visible
 * over USB (MTP) right away.
 */
@CapacitorPlugin(
    name = "ArchiveNative",
    permissions = { @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }) }
)
public class ArchiveNativePlugin extends Plugin {

    private static final Pattern FILE_NAME = Pattern.compile("^[A-Z]_\\d{8}_\\d{4}_\\d+boxes(_\\d+)?\\.zip$");
    private static final Pattern ENTRY_NAME = Pattern.compile("^boxes/[A-Z]-\\d{4}-[A-Z]/\\d{3}(_code)?\\.jpg$");

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    /** Internal storage/Documents/ArchiveInventory/exports */
    private File exportsDir() {
        File documents = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS);
        return new File(documents, "ArchiveInventory/exports");
    }

    private boolean needsStoragePermission() {
        return Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED;
    }

    @PluginMethod
    public void createZip(PluginCall call) {
        if (needsStoragePermission()) {
            requestPermissionForAlias("storage", call, "storagePermissionCallback");
            return;
        }
        executor.execute(() -> writeZip(call));
    }

    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            executor.execute(() -> writeZip(call));
        } else {
            call.reject("Storage permission denied", "PERMISSION_DENIED");
        }
    }

    private void writeZip(PluginCall call) {
        String fileName = call.getString("fileName", "");
        String manifest = call.getString("manifest");
        JSArray entries = call.getArray("entries");

        if (!FILE_NAME.matcher(fileName).matches() || manifest == null || entries == null) {
            call.reject("Invalid arguments", "INVALID_ARGUMENTS");
            return;
        }

        File dir = exportsDir();
        File part = new File(dir, fileName + ".part");
        File target = new File(dir, fileName);

        try {
            if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Cannot create " + dir);

            File dataDir = getContext().getFilesDir();
            String dataRoot = dataDir.getCanonicalPath() + File.separator;
            List<JSONObject> list = entries.toList();
            byte[] buffer = new byte[1 << 16];

            try (FileOutputStream fos = new FileOutputStream(part);
                 ZipOutputStream zip = new ZipOutputStream(new BufferedOutputStream(fos, 1 << 16))) {
                // JPEGs do not compress: store them as-is, it is much faster.
                zip.setLevel(Deflater.NO_COMPRESSION);

                zip.putNextEntry(new ZipEntry("manifest.json"));
                zip.write(manifest.getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();

                for (int i = 0; i < list.size(); i++) {
                    JSONObject entry = list.get(i);
                    String name = entry.getString("name");
                    File source = new File(dataDir, entry.getString("source"));
                    if (!ENTRY_NAME.matcher(name).matches() || !source.getCanonicalPath().startsWith(dataRoot)) {
                        throw new IOException("Refused entry " + name);
                    }

                    zip.putNextEntry(new ZipEntry(name));
                    try (InputStream in = new FileInputStream(source)) {
                        int read;
                        while ((read = in.read(buffer)) != -1) zip.write(buffer, 0, read);
                    }
                    zip.closeEntry();

                    if (i % 5 == 4 || i == list.size() - 1) {
                        JSObject progress = new JSObject();
                        progress.put("done", i + 1);
                        progress.put("total", list.size());
                        notifyListeners("zipProgress", progress);
                    }
                }

                zip.finish();
                zip.flush();
                fos.getFD().sync(); // the agent may unplug right after: make sure it is on disk
            }

            // Re-open the file to make sure it is a complete, readable ZIP.
            try (ZipFile check = new ZipFile(part)) {
                if (check.size() != list.size() + 1) throw new IOException("ZIP verification failed");
            }

            if (target.exists() && !target.delete()) throw new IOException("Cannot replace " + target);
            if (!part.renameTo(target)) throw new IOException("Cannot rename " + part);

            // Without this, the file may not show up on the PC over USB until the phone reboots.
            MediaScannerConnection.scanFile(getContext(), new String[] { target.getAbsolutePath(), dir.getAbsolutePath() }, null, null);

            JSObject result = new JSObject();
            result.put("path", target.getAbsolutePath());
            result.put("size", target.length());
            call.resolve(result);
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            part.delete();
            call.reject("ZIP failed: " + e.getMessage(), "ZIP_FAILED", e);
        }
    }

    @PluginMethod
    public void exportFileInfo(PluginCall call) {
        String fileName = call.getString("fileName", "");
        File file = new File(exportsDir(), fileName);
        boolean valid = FILE_NAME.matcher(fileName).matches();
        JSObject result = new JSObject();
        result.put("exists", valid && file.isFile());
        result.put("size", valid && file.isFile() ? file.length() : 0);
        call.resolve(result);
    }

    @PluginMethod
    public void storageInfo(PluginCall call) {
        File dataDir = getContext().getFilesDir();
        StatFs stat = new StatFs(dataDir.getPath());
        JSObject result = new JSObject();
        result.put("freeBytes", stat.getAvailableBytes());
        result.put("totalBytes", stat.getTotalBytes());
        result.put("photosBytes", sizeOf(new File(dataDir, "boxes")));
        call.resolve(result);
    }

    private static long sizeOf(File file) {
        if (file.isFile()) return file.length();
        long total = 0;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) total += sizeOf(child);
        return total;
    }
}
