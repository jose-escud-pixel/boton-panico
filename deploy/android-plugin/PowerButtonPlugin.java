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
     * Llamado por PowerButtonService cuando detecta 5 presiones del power button.
     * Abre MainActivity con una URL custom que el JS escucha vía App.addListener('appUrlOpen').
     */
    public static void triggerPanic(Context ctx) {
        Intent launch = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (launch == null) return;
        launch.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        launch.setData(Uri.parse("nacurutu://panic?source=power_button"));
        ctx.startActivity(launch);
    }
}
