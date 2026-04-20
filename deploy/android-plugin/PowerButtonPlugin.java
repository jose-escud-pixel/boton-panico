package net.aranduinformatica.nacurutu;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin Capacitor para activar/desactivar la detección de pánico por
 * botón de encendido (5 presiones rápidas) en Android.
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

    @PluginMethod
    public void enable(PluginCall call) {
        Context ctx = getContext();
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
     * Usa una Full-Screen Intent Notification — método oficial de Android 10+ para
     * abrir la app incluso con la pantalla bloqueada, sin depender del permiso
     * SYSTEM_ALERT_WINDOW ni de restricciones de background-activity-launch.
     */
    public static void triggerPanic(Context ctx) {
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch == null) return;
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launch.setData(Uri.parse("nacurutu://panic?source=power_button"));

        int piFlags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            piFlags |= android.app.PendingIntent.FLAG_IMMUTABLE;
        }
        android.app.PendingIntent pi = android.app.PendingIntent.getActivity(
                ctx, 777, launch, piFlags);

        // Canal de notificación HIGH importance para que dispare el full-screen intent
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
                ch.setDescription("Notificación que abre la app cuando se dispara pánico por botón");
                ch.enableVibration(true);
                ch.setBypassDnd(true);
                nm.createNotificationChannel(ch);
            }
        }

        androidx.core.app.NotificationCompat.Builder b =
                new androidx.core.app.NotificationCompat.Builder(ctx, channelId)
                        .setContentTitle("ÑACURUTU — Enviando pánico")
                        .setContentText("Abriendo la app...")
                        .setSmallIcon(ctx.getApplicationInfo().icon)
                        .setPriority(androidx.core.app.NotificationCompat.PRIORITY_MAX)
                        .setCategory(androidx.core.app.NotificationCompat.CATEGORY_ALARM)
                        .setAutoCancel(true)
                        .setContentIntent(pi)
                        .setFullScreenIntent(pi, true);

        nm.notify(888, b.build());

        // Fallback directo (funciona en Android antiguo o con SYSTEM_ALERT_WINDOW concedido)
        try {
            ctx.startActivity(launch);
        } catch (Exception ignored) {}
    }
}
