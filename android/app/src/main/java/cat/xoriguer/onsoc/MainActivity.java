package cat.xoriguer.onsoc;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SmsSosPlugin.class); // connector propi: SMS d'SOS
        super.onCreate(savedInstanceState);
    }
}
