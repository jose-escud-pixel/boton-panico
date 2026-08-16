package net.aranduinformatica.nacurutu;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import java.util.ArrayList;
import java.util.Locale;

/**
 * Servicio foreground que escucha el micrófono en ciclos cortos.
 * Cuando detecta la palabra clave configurada dispara:
 *   nacurutu://panic?source=voice
 * lo que la app React captura via appUrlOpen / getLaunchUrl.
 *
 * Ciclo: startListening → onResults/onError → pausa breve → startListening...
 * Usa el SpeechRecognizer del sistema (requiere internet).
 * Tipo de foreground service: "microphone" (Android 14+).
 */
public class MicListenerService extends Service {

    private static final String TAG         = "NacurutuMic";
    public  static final String ACTION_START = "net.aranduinformatica.nacurutu.MIC_START";
    public  static final String ACTION_STOP  = "net.aranduinformatica.nacurutu.MIC_STOP";
    public  static final String EXTRA_KEYWORD = "keyword";

    private static final String CHANNEL_ID = "nacurutu_mic_listener";
    private static final int    NOTIF_ID   = 2002;

    private SpeechRecognizer recognizer;
    private Handler          mainHandler;
    private String           keyword  = "icaro";
    private volatile boolean running  = false;

    // ------------------------------------------------------------------ lifecycle

    @Override
    public void onCreate() {
        super.onCreate();
        mainHandler = new Handler(Looper.getMainLooper());
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;

        String action = intent.getAction();

        if (ACTION_STOP.equals(action)) {
            running = false;
            mainHandler.removeCallbacksAndMessages(null);
            destroyRecognizer();
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        if (ACTION_START.equals(action)) {
            String kw = intent.getStringExtra(EXTRA_KEYWORD);
            keyword = (kw != null && !kw.isEmpty())
                    ? kw.toLowerCase(Locale.ROOT).trim()
                    : "icaro";
            running = true;
            startForeground(NOTIF_ID, buildNotification());
            postListenCycle(0);
        }

        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        running = false;
        mainHandler.removeCallbacksAndMessages(null);
        destroyRecognizer();
        super.onDestroy();
    }

    // ------------------------------------------------------------------ listen cycle

    private void postListenCycle(long delayMs) {
        if (!running) return;
        mainHandler.postDelayed(this::startOneCycle, delayMs);
    }

    private void startOneCycle() {
        if (!running) return;

        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            Log.w(TAG, "SpeechRecognizer no disponible — reintentando en 15s");
            postListenCycle(15_000);
            return;
        }

        destroyRecognizer();
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {

            @Override public void onReadyForSpeech(Bundle p)    { Log.d(TAG, "Escuchando..."); }
            @Override public void onBeginningOfSpeech()          {}
            @Override public void onRmsChanged(float rms)        {}
            @Override public void onBufferReceived(byte[] buf)   {}
            @Override public void onEndOfSpeech()                {}
            @Override public void onEvent(int type, Bundle p)    {}

            @Override
            public void onPartialResults(Bundle partialResults) {
                ArrayList<String> partial =
                        partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (checkKeyword(partial)) {
                    triggerPanic();
                    postListenCycle(3_000);
                }
            }

            @Override
            public void onResults(Bundle results) {
                ArrayList<String> matches =
                        results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (checkKeyword(matches)) {
                    triggerPanic();
                    postListenCycle(3_000);
                } else {
                    postListenCycle(500);
                }
            }

            @Override
            public void onError(int error) {
                // ERROR_NO_MATCH (6) y ERROR_SPEECH_TIMEOUT (7) son normales
                long delay;
                if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) {
                    delay = 3_000L;
                } else if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                    Log.e(TAG, "Sin permiso RECORD_AUDIO — deteniendo servicio");
                    running = false;
                    stopSelf();
                    return;
                } else {
                    delay = 800L;
                }
                if (running) postListenCycle(delay);
            }
        });

        Intent ri = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        ri.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        ri.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault());
        ri.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        // Silencio de 1.5s tras última palabra → cierra este ciclo
        ri.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS,   1_500L);
        ri.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1_500L);
        ri.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 200L);
        ri.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());

        try {
            recognizer.startListening(ri);
        } catch (Exception e) {
            Log.e(TAG, "startListening falló: " + e.getMessage());
            postListenCycle(2_000);
        }
    }

    // ------------------------------------------------------------------ helpers

    private boolean checkKeyword(ArrayList<String> candidates) {
        if (candidates == null) return false;
        for (String c : candidates) {
            if (c.toLowerCase(Locale.ROOT).contains(keyword)) {
                Log.i(TAG, "¡Palabra clave detectada! → \"" + c + "\"");
                return true;
            }
        }
        return false;
    }

    private void triggerPanic() {
        Intent deepLink = new Intent(
                Intent.ACTION_VIEW,
                Uri.parse("nacurutu://panic?source=voice"));
        deepLink.setPackage(getPackageName());
        deepLink.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try {
            startActivity(deepLink);
        } catch (Exception e) {
            Log.e(TAG, "Error disparando pánico por voz: " + e.getMessage());
        }
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            try {
                recognizer.stopListening();
                recognizer.destroy();
            } catch (Exception ignored) {}
            recognizer = null;
        }
    }

    // ------------------------------------------------------------------ notification

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID,
                    "Escucha de emergencia",
                    NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Detecta la palabra clave de pánico");
            ch.setShowBadge(false);
            ((NotificationManager) getSystemService(NOTIFICATION_SERVICE))
                    .createNotificationChannel(ch);
        }
    }

    private Notification buildNotification() {
        Notification.Builder b = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("Ñacurutu — Escucha activa")
                .setContentText("Decí tu palabra clave para enviar alerta de emergencia")
                .setOngoing(true)
                .build();
    }
}
