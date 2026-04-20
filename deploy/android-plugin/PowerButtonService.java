package net.aranduinformatica.nacurutu;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import java.util.ArrayList;

/**
 * Foreground service que escucha eventos de ACTION_SCREEN_ON/OFF (que Android
 * emite cada vez que el usuario presiona el botón de encendido) y, si detecta
 * 5 presiones dentro de 5 segundos, dispara el pánico vía PowerButtonPlugin.
 *
 * Muestra una notificación permanente (requisito de Android 8+ para foreground
 * services). Se inicia con ACTION_START y se detiene con ACTION_STOP.
 */
public class PowerButtonService extends Service {
    private static final String TAG = "PowerPanicSvc";
    public static final String ACTION_START = "ACTION_START";
    public static final String ACTION_STOP = "ACTION_STOP";
    private static final String CHANNEL_ID = "nacurutu_power_watch";
    private static final int NOTIF_ID = 9871;
    private static final int PRESSES_REQUIRED = 4;
    private static final long WINDOW_MS = 4000L;

    private BroadcastReceiver screenReceiver;
    private final ArrayList<Long> presses = new ArrayList<>();

    @Override
    public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel ch = new NotificationChannel(
                        CHANNEL_ID,
                        "ÑACURUTU vigilancia pánico",
                        NotificationManager.IMPORTANCE_LOW
                );
                ch.setDescription("Vigila el botón de encendido para disparar pánico");
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            Log.i(TAG, "Deteniendo servicio");
            unregisterScreenReceiver();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        Notification notif = buildNotification();
        startForeground(NOTIF_ID, notif);
        registerScreenReceiver();
        Log.i(TAG, "Servicio iniciado");
        return START_STICKY;
    }

    private Notification buildNotification() {
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        android.app.PendingIntent pi = null;
        if (launch != null) {
            int piFlags = android.app.PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                piFlags |= android.app.PendingIntent.FLAG_IMMUTABLE;
            }
            pi = android.app.PendingIntent.getActivity(this, 0, launch, piFlags);
        }

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("ÑACURUTU Seguridad")
                .setContentText("Botón de pánico rápido activo — 4 presiones al encendido")
                .setSmallIcon(getApplicationInfo().icon)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setCategory(NotificationCompat.CATEGORY_SERVICE);
        if (pi != null) b.setContentIntent(pi);
        return b.build();
    }

    private void registerScreenReceiver() {
        if (screenReceiver != null) return;
        screenReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String act = intent != null ? intent.getAction() : null;
                if (!Intent.ACTION_SCREEN_ON.equals(act) && !Intent.ACTION_SCREEN_OFF.equals(act)) return;

                long now = System.currentTimeMillis();
                // Purgar presiones fuera de la ventana
                while (!presses.isEmpty() && now - presses.get(0) > WINDOW_MS) {
                    presses.remove(0);
                }
                presses.add(now);
                Log.i(TAG, "Screen event " + act + " (count=" + presses.size() + ")");

                if (presses.size() >= PRESSES_REQUIRED) {
                    presses.clear();
                    Log.w(TAG, "¡PÁNICO POR POWER BUTTON DETECTADO!");
                    PowerButtonPlugin.triggerPanic(context);
                }
            }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_SCREEN_ON);
        f.addAction(Intent.ACTION_SCREEN_OFF);
        registerReceiver(screenReceiver, f);
    }

    private void unregisterScreenReceiver() {
        if (screenReceiver == null) return;
        try { unregisterReceiver(screenReceiver); } catch (Exception ignored) {}
        screenReceiver = null;
        presses.clear();
    }

    @Override
    public void onDestroy() {
        unregisterScreenReceiver();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
