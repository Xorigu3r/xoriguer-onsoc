package cat.xoriguer.onsoc;

import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/** Botó «SOS On Sóc» de la persiana: obre l'app amb cat.xoriguer.onsoc://sos, que mostra 5 s de compte enrere per cancel·lar. */
public class RajolaSos extends TileService {
    @Override
    public void onStartListening() {
        Tile t = getQsTile();
        if (t == null) return;
        t.setIcon(Icon.createWithResource(this, R.drawable.ic_sos));
        t.setLabel(getString(R.string.rajola_sos));
        if (Build.VERSION.SDK_INT >= 29) t.setSubtitle(getString(R.string.rajola_sos_sub));
        t.setState(Tile.STATE_INACTIVE);
        t.updateTile();
    }

    @Override
    public void onClick() {
        if (isLocked()) unlockAndRun(this::obre); else obre();
    }

    @SuppressWarnings("deprecation")
    private void obre() {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("cat.xoriguer.onsoc://sos"), this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        } else {
            startActivityAndCollapse(i);
        }
    }
}
