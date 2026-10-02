package com.guardian.parentalcontrol.service

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.guardian.parentalcontrol.GuardianApplication
import com.guardian.parentalcontrol.data.CommandResponse
import com.guardian.parentalcontrol.data.DeviceCommand
import com.guardian.parentalcontrol.hardware.LocationManager
import com.guardian.parentalcontrol.hardware.TorchManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import com.guardian.parentalcontrol.service.GuardianDeviceAdminReceiver
import kotlinx.coroutines.*

class ChildForegroundService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val firestore = FirebaseFirestore.getInstance()
    private var commandListener: ListenerRegistration? = null
    private lateinit var torchManager: TorchManager
    private lateinit var locationManager: LocationManager

    private var deviceId: String = ""
    private var guardianId: String = ""
    private var lastStopCameraTimestamp: Long = 0L
    private var pendingCameraJob: Job? = null
    private var mediaPlayer: MediaPlayer? = null

    override fun onCreate() {
        super.onCreate()
        torchManager = TorchManager(this)
        locationManager = LocationManager(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        deviceId = intent?.getStringExtra("DEVICE_ID") ?: ""
        guardianId = intent?.getStringExtra("GUARDIAN_ID") ?: ""

        val notification = createNotification()
        startForeground(1001, notification)

        startHeartbeatLoop()
        listenForCommands()

        return START_STICKY
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, GuardianApplication.CHANNEL_CHILD_SERVICE)
            .setContentTitle("Guardian Active")
            .setContentText("Parental safety service is actively protecting this device.")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setOngoing(true)
            .build()
    }

    private fun startHeartbeatLoop() {
        serviceScope.launch {
            while (isActive) {
                sendHeartbeat()
                delay(10_000L) // 10 seconds interval
            }
        }
    }

    private suspend fun sendHeartbeat() {
        if (deviceId.isEmpty()) return
        val batteryInfo = getBatteryStatus()
        val loc = locationManager.getCurrentLocation()

        val update = mapOf(
            "isOnline" to true,
            "lastSeen" to System.currentTimeMillis(),
            "batteryLevel" to batteryInfo.first,
            "isCharging" to batteryInfo.second,
            "location" to loc,
            "updatedAt" to System.currentTimeMillis().toString()
        )

        firestore.collection("childDevices").document(deviceId)
            .update(update)
    }

    private fun getBatteryStatus(): Pair<Int, Boolean> {
        val batteryIntent = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = batteryIntent?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = batteryIntent?.getIntExtra(BatteryManager.EXTRA_SCALE, -1) ?: -1
        val status = batteryIntent?.getIntExtra(BatteryManager.EXTRA_STATUS, -1) ?: -1
        val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
                status == BatteryManager.BATTERY_STATUS_FULL
        val pct = if (level >= 0 && scale > 0) ((level.toFloat() / scale.toFloat()) * 100).toInt() else 0
        return Pair(pct, isCharging)
    }

    private fun listenForCommands() {
        if (deviceId.isEmpty()) return
        commandListener?.remove()

        commandListener = firestore.collection("deviceCommands")
            .whereEqualTo("deviceId", deviceId)
            .whereEqualTo("status", "PENDING")
            .addSnapshotListener { snapshot, error ->
                if (error != null || snapshot == null) return@addSnapshotListener

                for (docChange in snapshot.documentChanges) {
                    if (docChange.type != com.google.firebase.firestore.DocumentChange.Type.ADDED) continue
                    val cmd = docChange.document.toObject(DeviceCommand::class.java)
                    serviceScope.launch {
                        handleCommand(cmd)
                    }
                }
            }
    }

    private suspend fun handleCommand(cmd: DeviceCommand) {
        val startTs = System.currentTimeMillis()
        var responseStatus = "OK"
        var responseMessage = "Executed"

        when (cmd.type) {
            "PING" -> {
                responseStatus = "OK"
                responseMessage = "PONG from Android Child Device"
            }
            "SIREN_ON" -> {
                try {
                    val alertUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
                    mediaPlayer?.stop()
                    mediaPlayer?.release()
                    mediaPlayer = MediaPlayer().apply {
                        setDataSource(this@ChildForegroundService, alertUri)
                        setAudioAttributes(
                            AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ALARM)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .build()
                        )
                        isLooping = true
                        prepare()
                        start()
                    }
                    responseMessage = "Emergency siren sounding"
                } catch (e: Exception) {
                    responseStatus = "ERROR"
                    responseMessage = "Siren error: ${e.message}"
                }
            }
            "SIREN_OFF" -> {
                try {
                    mediaPlayer?.stop()
                    mediaPlayer?.release()
                    mediaPlayer = null
                    responseMessage = "Emergency siren stopped"
                } catch (e: Exception) {
                    responseStatus = "ERROR"
                    responseMessage = "Failed to stop siren: ${e.message}"
                }
            }
            "LOCK_DEVICE" -> {
                try {
                    val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                    val adminComponent = ComponentName(this@ChildForegroundService, GuardianDeviceAdminReceiver::class.java)
                    if (dpm.isAdminActive(adminComponent)) {
                        dpm.lockNow()
                        responseMessage = "Child device locked by parent"
                    } else {
                        responseStatus = "ERROR"
                        responseMessage = "Device Admin permission not enabled on child device"
                    }
                } catch (e: Exception) {
                    responseStatus = "ERROR"
                    responseMessage = "Lock failed: ${e.message}"
                }
            }
            "FLASHLIGHT_ON", "TORCH_ON" -> {
                val res = torchManager.setTorch(true)
                if (res.isSuccess) {
                    firestore.collection("childDevices").document(deviceId)
                        .update("flashlightState", "ON")
                    responseMessage = "Flashlight turned ON"
                } else {
                    responseStatus = "ERROR"
                    responseMessage = res.exceptionOrNull()?.message ?: "Flashlight unsupported"
                }
            }
            "FLASHLIGHT_OFF", "TORCH_OFF" -> {
                torchManager.setTorch(false)
                firestore.collection("childDevices").document(deviceId)
                    .update("flashlightState", "OFF")
                responseMessage = "Flashlight turned OFF"
            }
            "START_CAMERA" -> {
                val cmdTime = cmd.createdAt.toLongOrNull() ?: 0L
                if (cmdTime > 0 && cmdTime <= lastStopCameraTimestamp) {
                    responseStatus = "OK"
                    responseMessage = "START_CAMERA cancelled by subsequent STOP_CAMERA"
                } else {
                    pendingCameraJob?.cancel()
                    val facing = cmd.payload["facingMode"]?.toString() ?: cmd.payload["lens"]?.toString() ?: "environment"
                    val camIntent = Intent(this@ChildForegroundService, CameraStreamService::class.java).apply {
                        action = CameraStreamService.ACTION_START_CAMERA
                        putExtra("DEVICE_ID", deviceId)
                        putExtra("FACING", facing)
                    }
                    startForegroundService(camIntent)

                    // Simultaneously initiate real-time AudioRecord streaming so parent hears ambient sound with video
                    val audioIntent = Intent(this@ChildForegroundService, AudioRecordService::class.java).apply {
                        putExtra("DEVICE_ID", deviceId)
                    }
                    startForegroundService(audioIntent)

                    responseMessage = "Native Camera2 ($facing) & Audio simultaneous streaming initiated"
                }
            }
            "STOP_CAMERA" -> {
                lastStopCameraTimestamp = System.currentTimeMillis()
                pendingCameraJob?.cancel()
                pendingCameraJob = null

                // Explicitly stop Camera2 capture session, device, and threads
                CameraStreamService.stopCamera(this@ChildForegroundService)

                // Also stop simultaneous audio stream
                try {
                    val audioIntent = Intent(this@ChildForegroundService, AudioRecordService::class.java)
                    stopService(audioIntent)
                } catch (e: Exception) {
                    // ignore
                }

                firestore.collection("childDevices").document(deviceId)
                    .update(mapOf(
                        "cameraStreaming" to false,
                        "cameraState" to "STOPPED",
                        "cameraStatus" to "CAMERA_STOPPED",
                        "audioStreaming" to false,
                        "audioState" to "DISCONNECTED"
                    ))
                responseMessage = "Camera & Audio stream stopped and hardware released"
            }
            "START_AUDIO" -> {
                val audioIntent = Intent(this@ChildForegroundService, AudioRecordService::class.java).apply {
                    putExtra("DEVICE_ID", deviceId)
                }
                startForegroundService(audioIntent)
                responseMessage = "Native AudioRecord capture initiated"
            }
            "STOP_AUDIO" -> {
                val audioIntent = Intent(this@ChildForegroundService, AudioRecordService::class.java)
                stopService(audioIntent)
                responseMessage = "Audio stream stopped"
            }
            "START_SCREEN" -> {
                val screenIntent = Intent(this@ChildForegroundService, ScreenCaptureService::class.java).apply {
                    putExtra("DEVICE_ID", deviceId)
                }
                startForegroundService(screenIntent)
                responseMessage = "Screen mirroring initiated"
            }
            "STOP_SCREEN" -> {
                val screenIntent = Intent(this@ChildForegroundService, ScreenCaptureService::class.java)
                stopService(screenIntent)
                responseMessage = "Screen mirroring stopped"
            }
            "REFRESH_LOCATION", "PING_LOCATION" -> {
                val loc = locationManager.getCurrentLocation()
                firestore.collection("childDevices").document(deviceId)
                    .update("location", loc)
                responseMessage = "Location updated"
            }
            else -> {
                responseStatus = "ERROR"
                responseMessage = "Unsupported command: ${cmd.type}"
            }
        }

        val update = mapOf(
            "status" to if (responseStatus == "OK") "EXECUTED" else "FAILED",
            "response" to CommandResponse(
                status = responseStatus,
                message = responseMessage,
                roundtripMs = System.currentTimeMillis() - startTs,
                timestamp = System.currentTimeMillis()
            ),
            "updatedAt" to System.currentTimeMillis().toString()
        )

        firestore.collection("deviceCommands").document(cmd.commandId).update(update)
    }

    override fun onDestroy() {
        try {
            mediaPlayer?.stop()
            mediaPlayer?.release()
            mediaPlayer = null
        } catch (e: Exception) {}
        super.onDestroy()
        commandListener?.remove()
        serviceScope.cancel()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
