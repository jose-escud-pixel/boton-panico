package net.aranduinformatica.nacurutu;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Puente Capacitor → MicListenerService.
 *
 * Métodos JS disponibles:
 *   MicListener.start({ keyword: "icaro" })
 *   MicListener.stop()
 *   MicListener.isRunning()  →  { running: boolean }
 *
 * El permiso RECORD_AUDIO se solicita nativamente al llamar start(),
 * mostrando el diálogo estándar de Android. Si el usuario lo deniega,
 * la llamada se rechaza con un mensaje claro.
 *
 * El estado "enabled" se persiste en SharedPreferences para que BootReceiver
 * pueda reiniciar el servicio automáticamente tras un reinicio del teléfono.
 */
@CapacitorPlugin(
    name = "MicListener",
    permissions = {
        @Permission(
            strings = { Manifest.permission.RECORD_AUDIO },
            alias   = "microphone"
        )
    }
)
public class MicListenerPlugin extends Plugin {

    static final String PREFS_NAME   = "nacurutu_mic_listener";
    static final String PREF_ENABLED = "enabled";
    static final String PREF_KEYWORD = "keyword";

    // ── start ─────────────────────────────────────────────────────────────────

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            // Solicita el permiso nativamente → muestra el diálogo de Android
            requestPermissionForAlias("microphone", call, "micPermissionCallback");
            return;
        }
        doStart(call);
    }

    @PermissionCallback
    private void micPermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            doStart(call);
        } else {
            call.reject("Permiso de micrófono denegado");
        }
    }

    private void doStart(PluginCall call) {
        String keyword = call.getString("keyword", "icaro");
        Context ctx = getContext();

        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .putBoolean(PREF_ENABLED, true)
                .putString(PREF_KEYWORD, keyword)
                .apply();

        Intent svc = new Intent(ctx, MicListenerService.class);
        svc.setAction(MicListenerService.ACTION_START);
        svc.putExtra(MicListenerService.EXTRA_KEYWORD, keyword);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.startForegroundService(svc);
        } else {
            ctx.startService(svc);
        }

        call.resolve();
    }

    // ── stop ──────────────────────────────────────────────────────────────────

    @PluginMethod
    public void stop(PluginCall call) {
        Context ctx = getContext();

        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
                .putBoolean(PREF_ENABLED, false)
                .apply();

        Intent svc = new Intent(ctx, MicListenerService.class);
        svc.setAction(MicListenerService.ACTION_STOP);
        ctx.startService(svc);

        call.resolve();
    }

    // ── isRunning ─────────────────────────────────────────────────────────────

    @PluginMethod
    public void isRunning(PluginCall call) {
        boolean enabled = getContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(PREF_ENABLED, false);
        JSObject ret = new JSObject();
        ret.put("running", enabled);
        call.resolve(ret);
    }
}
