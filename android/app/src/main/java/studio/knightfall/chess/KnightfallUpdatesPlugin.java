package studio.knightfall.chess;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicBoolean;

/** User-started, bounded APK download. Android confirms the in-place install. */
@CapacitorPlugin(name = "KnightfallUpdates")
public class KnightfallUpdatesPlugin extends Plugin {
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private volatile String state = "idle", pendingVersion = "", message = "";
    private volatile int progress = 0;
    private File apk() { return new File(getContext().getCacheDir(), "knightfall-update.apk"); }
    private android.content.SharedPreferences prefs() { return getContext().getSharedPreferences("knightfall-updater", 0); }
    private JSObject snapshot() {
        JSObject value = new JSObject();
        value.put("status", state); value.put("latestVersion", pendingVersion);
        value.put("progress", progress); value.put("message", message);
        return value;
    }
    private void publish(String next, String text) {
        state = next; message = text; notifyListeners("status", snapshot());
    }
    private String[] signers(PackageInfo info) throws Exception {
        Signature[] signatures = Build.VERSION.SDK_INT >= 28
            ? (info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners()) : info.signatures;
        if (signatures == null) return null;
        String[] digests = new String[signatures.length];
        for (int i = 0; i < signatures.length; i++) {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(signatures[i].toByteArray());
            StringBuilder hex = new StringBuilder(); for (byte b : hash) hex.append(String.format("%02x", b & 255));
            digests[i] = hex.toString();
        }
        return digests;
    }
    private void verify(File file, String version) throws Exception {
        PackageManager pm = getContext().getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo installed = pm.getPackageInfo(getContext().getPackageName(), flags);
        PackageInfo downloaded = pm.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        if (downloaded == null || !UpdatePolicy.validIdentity(installed.packageName, downloaded.packageName,
                Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode,
                Build.VERSION.SDK_INT >= 28 ? downloaded.getLongVersionCode() : downloaded.versionCode,
                version, downloaded.versionName, signers(installed), signers(downloaded)))
            throw new IOException("The APK must be newer and signed by the same developer as this installed app.");
    }
    @PluginMethod
    public void getStatus(PluginCall call) {
        execute(() -> {
            if (!busy.get() && state.equals("idle")) {
                String saved = prefs().getString("version", "");
                if (!saved.isEmpty() && apk().isFile()) {
                    try { verify(apk(), saved); pendingVersion = saved; progress = 100; state = "ready"; message = "Update downloaded. Approve the in-place update when you are ready."; }
                    catch (Exception error) { apk().delete(); prefs().edit().remove("version").apply(); }
                }
            }
            call.resolve(snapshot());
        });
    }
    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url"), version = call.getString("version");
        if (!UpdatePolicy.validSource(url, version)) { call.reject("Invalid Knightfall release."); return; }
        if (!busy.compareAndSet(false, true)) { call.reject("An update is already downloading."); return; }
        pendingVersion = version; progress = 0;
        publish("downloading", "Downloading the Android update. Keep Knightfall open; your game stays available.");
        call.resolve(snapshot());
        execute(() -> {
            File partial = new File(getContext().getCacheDir(), "knightfall-update.part");
            HttpURLConnection connection = null;
            try {
                String next = url;
                for (int hop = 0; hop < 6; hop++) {
                    if (!UpdatePolicy.allowedRedirect(next)) throw new IOException("Untrusted download redirect.");
                    connection = (HttpURLConnection) new URL(next).openConnection();
                    connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
                    connection.setRequestProperty("User-Agent", "Knightfall-Android-Updater");
                    int code = connection.getResponseCode();
                    if (code >= 300 && code < 400) {
                        String location = connection.getHeaderField("Location");
                        if (location == null) throw new IOException("Missing download location.");
                        next = new URL(new URL(next), location).toString(); connection.disconnect(); connection = null; continue;
                    }
                    if (code != 200) throw new IOException("Release download unavailable.");
                    break;
                }
                if (connection == null) throw new IOException("Too many download redirects.");
                long expected = connection.getContentLengthLong(), total = 0, limit = 512L * 1024 * 1024;
                if (expected > limit) throw new IOException("Update is too large.");
                long deadline = System.currentTimeMillis() + 20 * 60 * 1000;
                try (InputStream input = connection.getInputStream(); OutputStream output = new FileOutputStream(partial)) {
                    byte[] buffer = new byte[65536]; int count;
                    while ((count = input.read(buffer)) != -1) {
                        total += count;
                        if (total > limit || System.currentTimeMillis() > deadline) throw new IOException("Update exceeded the download limit.");
                        output.write(buffer, 0, count);
                        int percent = expected > 0 ? (int)Math.min(99, total * 100 / expected) : 0;
                        if (percent != progress) { progress = percent; notifyListeners("status", snapshot()); }
                    }
                }
                if (total == 0 || (expected > 0 && total != expected)) throw new IOException("Incomplete update download.");
                verify(partial, version);
                if (apk().exists() && !apk().delete()) throw new IOException("Cannot replace cached update.");
                if (!partial.renameTo(apk())) throw new IOException("Cannot save update.");
                prefs().edit().putString("version", version).apply(); progress = 100;
                publish("ready", "Update ready. Android will ask you to approve it; saved games and settings stay in place.");
            } catch (Exception error) {
                partial.delete();
                publish("unavailable", "Could not download or verify this update. Check your connection and retry. No app data was changed.");
            } finally { if (connection != null) connection.disconnect(); busy.set(false); }
        });
    }
    @PluginMethod
    public void install(PluginCall call) {
        execute(() -> {
            try {
                if (!state.equals("ready")) throw new IOException("Download an update first.");
                verify(apk(), pendingVersion);
                getActivity().runOnUiThread(() -> {
                    try {
                        if (Build.VERSION.SDK_INT >= 26 && !getContext().getPackageManager().canRequestPackageInstalls()) {
                            Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
                            getActivity().startActivity(settings);
                            message = "Allow updates from Knightfall in Android settings, return here, then tap Install update again.";
                            notifyListeners("status", snapshot()); call.resolve(snapshot()); return;
                        }
                        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk());
                        Intent install = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive");
                        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        getActivity().startActivity(install); call.resolve(snapshot());
                    } catch (RuntimeException error) { call.reject("Android could not open its update installer.", error); }
                });
            } catch (Exception error) { call.reject("The downloaded update is no longer valid. Check for updates again.", error); }
        });
    }
}
