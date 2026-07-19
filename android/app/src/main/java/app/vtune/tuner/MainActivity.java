package app.vtune.tuner;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Ask for the microphone up front. The WebView's getUserMedia only gets
    // the mic if the app already holds the RECORD_AUDIO runtime permission —
    // Capacitor's WebChromeClient grants the web-layer request but doesn't
    // reliably raise the OS prompt itself, so a fresh install would otherwise
    // fail with "Permission denied" and pick up no signal. Requesting on
    // launch means it's granted by the time the user hits "Let's Go".
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{ Manifest.permission.RECORD_AUDIO },
                    1
            );
        }
    }
}
