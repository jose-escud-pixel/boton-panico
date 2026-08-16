package net.aranduinformatica.nacurutu;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin Capacitor para activar/desactivar la detección de pánico por
 * botón de encendido (4 presiones rápidas) en Android.
 *
 * Uso desde JS:
 *   import { registerPlugin } from '@capacitor/core';
 *   const PowerPanic = registerPlugin('PowerButtonPanic');
 *   await PowerPanic.enable();
 *   await PowerPanic.disable();
 *   await PowerPanic.isSupported();
 */
@CapacitorPlugin(name = "PowerButtonPanic")
public class PowerButtonPlugin extends Plugin {

    static final String PREFS_NAME = "nacurutu_power_panic";
    static final String PREF_ENABLED = "enabled";

    @PluginMethod
    public void enable(PluginCall call) {
        Context ctx = getContext();
        // Persistir en SharedPreferences para que BootReceiver pueda releer tras reinicio
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putBoolean(PREF_ENABLED, true).apply();
        Intent svc = new Intent(ctx, PowerButtonService.class);
        svc.setAction(PowerButtonService.ACTION_START);
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                ctx.startForegroundService(svc);
            } else {
                ctx.startService(svc);
            }
            JSObject ret = new JSObject();
            ret.put("enabled", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("No se pudo iniciar el servicio: " + e.getMessage());
        }
    }

    @PluginMethod
    public void disable(PluginCall call) {
        Context ctx = getContext();
        // Borrar preferencia para que BootReceiver no lo relance tras reinicio
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putBoolean(PREF_ENABLED, false).apply();
        Intent svc = new Intent(ctx, PowerButtonService.class);
        svc.setAction(PowerButtonService.ACTION_STOP);
        try {
            ctx.startService(svc);
            JSObject ret = new JSObject();
            ret.put("enabled", false);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("No se pudo detener el servicio: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", true);
        ret.put("platform", "android");
        call.resolve(ret);
    }

    /**
     * Llamado por PowerButtonService cuando detecta 4 presiones del power button.
     *
     * Estrategia multi-capa para Android 10+:
     *  1. Full-Screen Intent Notification (método oficial para abrir app con pantalla bloqueada)
     *  2. Deep link via ACTION_VIEW + nacurutu:// (correcto — NO usar getLaunchIntentForPackage
     *     con setData(), eso rompe el matching del intent-filter)
     */
    public static void triggerPanic(Context ctx) {
        // FIX: usar ACTION_VIEW con el scheme nacurutu://, NO getLaunchIntentForPackage+setData.
        // getLaunchIntentForPackage devuelve ACTION_MAIN+CATEGORY_LAUNCHER (sin data).
        // Agregarle setData() hace que el intent no matchee ningún filter de la Activity.
        // La solución correcta es un intent VIEW explícito restringido al paquete propio.
        Intent deepLink = new Intent(Intent.ACTION_VIEW, Uri.parse("nacurutu://panic?source=power_button"));
        deepLink.setPackage(ctx.getPackageName()); // evita el chooser de apps
        deepLink.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int piFlags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            piFlags |= android.app.PendingIntent.FLAG_IMMUTABLE;
        }
        android.app.PendingIntent pi = android.app.PendingIntent.getActivity(
                ctx, 777, deepLink, piFlags);

        // Canal HIGH importance para disparar full-screen intent
        android.app.NotificationManager nm = (android.app.NotificationManager)
                ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        String channelId = "nacurutu_panic_trigger";
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            if (nm.getNotificationChannel(channelId) == null) {
                android.app.NotificationChannel ch = new android.app.NotificationChannel(
                        channelId,
                        "Pánico disparado",
                        android.app.NotificationManager.IMPORTANCE_HIGH
                );
                ch.setDescription("Notificación de pánico por botón de encendido");
                ch.enableVibration(true);
                ch.setBypassDnd(true);
                nm.createNotificationChannel(ch);
            }
        }

        androidx.core.app.NotificationCompat.Builder b =
                new androidx.core.app.NotificationCompat.Builder(ctx, channelId)
                        .setContentTitle("ÑACURUTU — Enviando pánico")
                        .setContentText("Toca aquí o la app se abrirá automáticamente")
                        .setSmallIcon(ctx.getApplicationInfo().icon)
                        .setPriority(androidx.core.app.NotificationCompat.PRIORITY_MAX)
                        .setCategory(androidx.core.app.NotificationCompat.CATEGORY_ALARM)
                        .setAutoCancel(true)
                        .setContentIntent(pi)
                        .setFullScreenIntent(pi, true);

        nm.notify(888, b.build());

        // Fallback directo para Android < 10 o cuando SYSTEM_ALERT_WINDOW está concedido.
        // En Android 10+ startActivity() desde background lanza BackgroundActivityStartNotAllowed,
        // que capturamos silenciosamente — la notificación es el mecanismo principal.
        try {
            ctx.startActivity(deepLink);
        } catch (Exception ignored) {}
    }
}
