package com.boby.starward;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    @PluginMethod
    public void openDownload(PluginCall call) {
        String url = call.getString("url", "");
        if (!url.matches("https://github\\.com/guangfengliao-wq/starward/releases/download/v(\\d+\\.\\d+\\.\\d+)/starward-v\\1\\.apk")) {
            call.reject("Invalid update URL");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to open browser", error);
        }
    }
}
