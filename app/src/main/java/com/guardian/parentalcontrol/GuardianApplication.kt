package com.guardian.parentalcontrol

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build

class GuardianApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(NotificationManager::class.java)

            // Child foreground persistent service notification
            val serviceChannel = NotificationChannel(
                CHANNEL_CHILD_SERVICE,
                "Guardian Protection Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows that Guardian parental protection is actively running on this device."
            }

            // Command and alert notifications
            val alertChannel = NotificationChannel(
                CHANNEL_ALERTS,
                "Guardian Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Urgent alerts such as device offline or low battery."
            }

            notificationManager.createNotificationChannel(serviceChannel)
            notificationManager.createNotificationChannel(alertChannel)
        }
    }

    companion object {
        const val CHANNEL_CHILD_SERVICE = "guardian_child_service_channel"
        const val CHANNEL_ALERTS = "guardian_alerts_channel"
    }
}
