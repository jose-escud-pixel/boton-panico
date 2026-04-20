package net.aranduinformatica.nacurutu;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PowerButtonPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
