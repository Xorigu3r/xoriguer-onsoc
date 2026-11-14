package cat.xoriguer.onsoc;

import android.Manifest;
import android.os.Build;
import android.telephony.SmsManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;

/** Connector «SmsSos»: envia l'SMS d'SOS als telèfons de la família (només si l'usuari l'ha activat i ha donat el permís). */
@CapacitorPlugin(name = "SmsSos", permissions = { @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS }) })
public class SmsSosPlugin extends Plugin {

    @PluginMethod
    public void demanaPermis(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) { resposta(call); return; }
        requestPermissionForAlias("sms", call, "tornaPermis");
    }

    @PermissionCallback
    private void tornaPermis(PluginCall call) { resposta(call); }

    private void resposta(PluginCall call) {
        JSObject r = new JSObject();
        r.put("sms", getPermissionState("sms") == PermissionState.GRANTED ? "granted" : "denied");
        call.resolve(r);
    }

    @PluginMethod
    public void envia(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) { call.reject("Sense permís d'SMS"); return; }
        String text = call.getString("text", "");
        JSArray nums = call.getArray("numeros", new JSArray());
        int fets = 0;
        try {
            SmsManager sm = Build.VERSION.SDK_INT >= 31 ? getContext().getSystemService(SmsManager.class) : SmsManager.getDefault();
            List<String> llista = nums.toList();
            ArrayList<String> trossos = sm.divideMessage(text);
            for (String n : llista) {
                if (n == null || n.trim().isEmpty()) continue;
                sm.sendMultipartTextMessage(n.trim(), null, trossos, null, null);
                fets++;
            }
        } catch (Exception e) {
            call.reject("No s'ha pogut enviar: " + e.getMessage());
            return;
        }
        JSObject r = new JSObject();
        r.put("enviats", fets);
        call.resolve(r);
    }
}
