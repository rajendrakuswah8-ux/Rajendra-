package com.guardian.parentalcontrol.service

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast

class GuardianDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onEnabled(context: Context, intent: Intent) {
        super.onEnabled(context, intent)
        Toast.makeText(context, "Guardian Anti-Uninstall Protection: ENABLED", Toast.LENGTH_SHORT).show()
    }

    override fun onDisableRequested(context: Context, intent: Intent): CharSequence {
        // Blocks casual deactivation and warns that parent security code is required
        return "WARNING: Guardian Parental Control is active! Deactivating requires your Parent Security PIN. Unauthorized attempts will immediately alert parents and lock the device."
    }

    override fun onDisabled(context: Context, intent: Intent) {
        super.onDisabled(context, intent)
        Toast.makeText(context, "Guardian Device Administrator disabled", Toast.LENGTH_SHORT).show()
    }
}
