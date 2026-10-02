package com.guardian.parentalcontrol.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.Service
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.IBinder
import android.util.Base64
import androidx.core.app.NotificationCompat
import com.google.firebase.firestore.FirebaseFirestore
import com.guardian.parentalcontrol.GuardianApplication
import kotlinx.coroutines.*

class AudioRecordService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val firestore = FirebaseFirestore.getInstance()
    private var audioRecord: AudioRecord? = null
    private var isRecording = false
    private var deviceId: String = ""

    private val sampleRate = 16000
    private val channelConfig = AudioFormat.CHANNEL_IN_MONO
    private val audioFormat = AudioFormat.ENCODING_PCM_16BIT

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        deviceId = intent?.getStringExtra("DEVICE_ID") ?: ""

        val notification = createNotification()
        startForeground(1003, notification)

        startRecording()
        return START_NOT_STICKY
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, GuardianApplication.CHANNEL_CHILD_SERVICE)
            .setContentTitle("Guardian Audio Active")
            .setContentText("Microphone audio monitoring is active.")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setOngoing(true)
            .build()
    }

    @SuppressLint("MissingPermission")
    private fun startRecording() {
        val minBufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
        val bufferSize = maxOf(minBufferSize, 2048)

        try {
            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize
            )

            audioRecord?.startRecording()
            isRecording = true

            serviceScope.launch {
                val buffer = ShortArray(1024)
                while (isActive && isRecording) {
                    val read = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                    if (read > 0) {
                        val byteBuffer = ByteArray(read * 2)
                        for (i in 0 until read) {
                            val sample = buffer[i].toInt()
                            byteBuffer[i * 2] = (sample and 0xFF).toByte()
                            byteBuffer[i * 2 + 1] = ((sample shr 8) and 0xFF).toByte()
                        }
                        val base64 = Base64.encodeToString(byteBuffer, Base64.NO_WRAP)

                        if (deviceId.isNotEmpty()) {
                            firestore.collection("childDevices").document(deviceId)
                                .update(mapOf(
                                    "audioStreaming" to true,
                                    "audioChunk" to base64,
                                    "updatedAt" to System.currentTimeMillis().toString()
                                ))
                        }
                    }
                    delay(50)
                }
            }
        } catch (e: SecurityException) {
            stopSelf()
        } catch (e: Exception) {
            stopSelf()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        isRecording = false
        serviceScope.cancel()
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (e: Exception) {
            e.printStackTrace()
        }
        audioRecord = null
        if (deviceId.isNotEmpty()) {
            firestore.collection("childDevices").document(deviceId)
                .update("audioStreaming", false)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
