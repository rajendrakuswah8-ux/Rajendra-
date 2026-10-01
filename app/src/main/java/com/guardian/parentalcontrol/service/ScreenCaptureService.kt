package com.guardian.parentalcontrol.service

import android.app.Notification
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.google.firebase.firestore.FirebaseFirestore
import com.guardian.parentalcontrol.GuardianApplication

class ScreenCaptureService : Service() {

    private val firestore = FirebaseFirestore.getInstance()
    private var deviceId: String = ""

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        deviceId = intent?.getStringExtra("DEVICE_ID") ?: ""

        val notification = createNotification()
        startForeground(1004, notification)

        if (deviceId.isNotEmpty()) {
            firestore.collection("childDevices").document(deviceId)
                .update("screenStreaming", true)
        }

        return START_NOT_STICKY
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, GuardianApplication.CHANNEL_CHILD_SERVICE)
            .setContentTitle("Guardian Screen Mirroring")
            .setContentText("Screen mirroring is active for authorized guardian.")
            .setSmallIcon(android.R.drawable.ic_menu_slideshow)
            .setOngoing(true)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (deviceId.isNotEmpty()) {
            firestore.collection("childDevices").document(deviceId)
                .update("screenStreaming", false)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
