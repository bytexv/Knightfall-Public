package studio.knightfall.chess;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

/** Saves a user-requested text export through Android's document picker. */
@CapacitorPlugin(name = "KnightfallFiles")
public class KnightfallFilesPlugin extends Plugin {
    private static final int MAX_EXPORT_BYTES = 10 * 1024 * 1024;
    private final AtomicBoolean pickerOpen = new AtomicBoolean(false);

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        if (data == null || data.getBytes(StandardCharsets.UTF_8).length > MAX_EXPORT_BYTES) {
            call.reject("Export data is missing or exceeds the 10 MiB limit.", "INVALID_EXPORT");
            return;
        }
        if (!pickerOpen.compareAndSet(false, true)) {
            call.reject("Finish the open save dialog first.", "SAVE_IN_PROGRESS");
            return;
        }
        String filename = ExportFilename.sanitize(call.getString("filename", "Knightfall-game.pgn"));
        String lower = filename.toLowerCase(Locale.ROOT);
        String mime = lower.endsWith(".pgn") ? "application/x-chess-pgn" :
                lower.endsWith(".json") ? "application/json" : "text/plain";
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        getActivity().runOnUiThread(() -> {
            try {
                startActivityForResult(call, intent, "documentCreated");
            } catch (ActivityNotFoundException error) {
                pickerOpen.set(false);
                call.reject("This device does not provide a file save picker.", "NO_FILE_PICKER", error);
            } catch (RuntimeException error) {
                pickerOpen.set(false);
                call.reject("The save dialog could not be opened.", "SAVE_FAILED", error);
            }
        });
    }

    @ActivityCallback
    private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) {
            pickerOpen.set(false);
            return;
        }
        Intent resultIntent = result.getData();
        Uri uri = resultIntent == null ? null : resultIntent.getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            pickerOpen.set(false);
            call.reject("Save cancelled.", "USER_CANCELLED");
            return;
        }
        execute(() -> {
            try {
                try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "wt")) {
                    if (output == null) throw new IOException("The selected location cannot be written.");
                    String data = call.getString("data", "");
                    byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
                    if (bytes.length > MAX_EXPORT_BYTES) throw new IOException("Export exceeds the 10 MiB limit.");
                    output.write(bytes);
                    output.flush();
                }
                JSObject response = new JSObject();
                response.put("saved", true);
                response.put("filename", ExportFilename.sanitize(call.getString("filename", "Knightfall-game.pgn")));
                call.resolve(response);
            } catch (IOException | RuntimeException error) {
                call.reject("The file could not be saved to the selected location.", "SAVE_FAILED", error);
            } finally {
                pickerOpen.set(false);
            }
        });
    }
}
