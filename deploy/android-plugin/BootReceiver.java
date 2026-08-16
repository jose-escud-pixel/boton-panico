package net.aranduinformatica.nacurutu;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * BroadcastReceiver que escucha BOOT_COMPLETED (y QUICKBOOT_POWERON para
 * Huawei/MIUI) y reinicia automáticamente los servicios que el usuario
 * tenía habilitados antes del reinicio:
 *
 *   - PowerButtonService  (detección de pulsaciones del botón power)
 *   - MicListenerService  (escucha de palabra clave por micrófono)
 *
 * El estado de cada servicio se lee de sus respectivas SharedPreferences.
 * Requiere permiso: android.permission.RECEIVE_BOOT_COMPLETED en el manifest.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "NacurutuBoot";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
                && !"android.intent.action.QUICKBOOT_POWERON".equals(action)
                && !"com.htc.intent.action.QUICKBOOT_POWERON".equals(action)) {
            return;
        }

        Log.i(TAG, "Boot detectado — verificando servicios...");

        // ── PowerButtonService ──────────────────────────────────────────────
        boolean powerEnabled = context
                .getSharedPreferences(PowerButtonPlugin.PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(PowerButtonPlugin.PREF_ENABLED, false);

        if (powerEnabled) {
            Log.i(TAG, "Reiniciando PowerButtonService...");
            Intent svc = new Intent(context, PowerButtonService.class);
            svc.setAction(PowerButtonService.ACTION_START);
            startService(context, svc);
        } else {
            Log.d(TAG, "PowerButtonService desactivado — no se reinicia");
        }

        // ── MicListenerService ──────────────────────────────────────────────
        boolean micEnabled = context
                .getSharedPreferences(MicListenerPlugin.PREFS_NAME, Context.MODE_PRIVATE)
                .getBoolean(MicListenerPlugin.PREF_ENABLED, false);

        if (micEnabled) {
            String keyword = context
                    .getSharedPreferences(MicListenerPlugin.PREFS_NAME, Context.MODE_PRIVATE)
                    .getString(MicListenerPlugin.PREF_KEYWORD, "icaro");

            Log.i(TAG, "Reiniciando MicListenerService (keyword=" + keyword + ")...");
            Intent mic = new Intent(context, MicListenerService.class);
            mic.setAction(MicListenerService.ACTION_START);
            mic.putExtra(MicListenerService.EXTRA_KEYWORD, keyword);
            startService(context, mic);
        } else {
            Log.d(TAG, "MicListenerService desactivado — no se reinicia");
        }
    }

    private void startService(Context context, Intent svc) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(svc);
            } else {
                context.startService(svc);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error al reiniciar servicio: " + e.getMessage());
        }
    }
}
