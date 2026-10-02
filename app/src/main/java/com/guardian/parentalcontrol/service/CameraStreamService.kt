package com.guardian.parentalcontrol.service

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import android.hardware.camera2.*
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.Base64
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.firestore.FirebaseFirestore
import com.guardian.parentalcontrol.GuardianApplication
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean

class CameraStreamService : Service() {

    private val firestore = FirebaseFirestore.getInstance()
    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var imageReader: ImageReader? = null
    private var backgroundThread: HandlerThread? = null
    private var backgroundHandler: Handler? = null

    private var deviceId: String = ""
    private var lensFacing: Int = CameraCharacteristics.LENS_FACING_BACK

    companion object {
        private const val TAG = "CameraStreamService"
        const val ACTION_START_CAMERA = "com.guardian.action.START_CAMERA"
        const val ACTION_STOP_CAMERA = "com.guardian.action.STOP_CAMERA"

        // Global cancellation token: false immediately disables camera hardware, loops, and reconnects
        val cameraRequested = AtomicBoolean(false)
        private var instance: CameraStreamService? = null

        fun stopCamera(context: Context) {
            cameraRequested.set(false)
            instance?.stopCameraInternal()
            try {
                val intent = Intent(context, CameraStreamService::class.java).apply {
                    action = ACTION_STOP_CAMERA
                }
                context.startService(intent)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send stopCamera intent", e)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP_CAMERA) {
            stopCameraInternal()
            stopSelf()
            return START_NOT_STICKY
        }

        deviceId = intent?.getStringExtra("DEVICE_ID") ?: ""
        val facingStr = intent?.getStringExtra("FACING") ?: "environment"
        lensFacing = if (facingStr.equals("user", ignoreCase = true) || facingStr.equals("front", ignoreCase = true)) {
            CameraCharacteristics.LENS_FACING_FRONT
        } else {
            CameraCharacteristics.LENS_FACING_BACK
        }

        // Set requested cancellation token to TRUE
        cameraRequested.set(true)

        val notification = createNotification()
        startForeground(1002, notification)

        startBackgroundThread()
        openCamera()

        return START_NOT_STICKY
    }

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, GuardianApplication.CHANNEL_CHILD_SERVICE)
            .setContentTitle("Guardian Camera Active")
            .setContentText("Camera stream is active for authorized guardian.")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setOngoing(true)
            .build()
    }

    private fun startBackgroundThread() {
        stopBackgroundThread()
        backgroundThread = HandlerThread("CameraBackground").also { it.start() }
        backgroundHandler = Handler(backgroundThread!!.looper)
    }

    private fun stopBackgroundThread() {
        backgroundHandler?.removeCallbacksAndMessages(null)
        backgroundThread?.quitSafely()
        try {
            backgroundThread?.join(500)
        } catch (e: InterruptedException) {
            e.printStackTrace()
        }
        backgroundThread = null
        backgroundHandler = null
    }

    private fun openCamera() {
        // Pre-check cancellation flag
        if (!cameraRequested.get()) {
            Log.d(TAG, "openCamera aborted: cameraRequested is false")
            stopSelf()
            return
        }

        val manager = getSystemService(Context.CAMERA_SERVICE) as CameraManager
        try {
            var targetCameraId: String? = null
            for (id in manager.cameraIdList) {
                val characteristics = manager.getCameraCharacteristics(id)
                if (characteristics.get(CameraCharacteristics.LENS_FACING) == lensFacing) {
                    targetCameraId = id
                    break
                }
            }

            if (targetCameraId == null) {
                targetCameraId = manager.cameraIdList.firstOrNull() ?: return
            }

            imageReader = ImageReader.newInstance(480, 360, ImageFormat.YUV_420_888, 2)
            imageReader?.setOnImageAvailableListener({ reader ->
                // Check cancellation flag before acquiring or encoding frame
                if (!cameraRequested.get()) {
                    reader.acquireLatestImage()?.close()
                    return@setOnImageAvailableListener
                }

                val image = reader.acquireLatestImage() ?: return@setOnImageAvailableListener
                try {
                    if (!cameraRequested.get()) return@setOnImageAvailableListener

                    val nv21 = yuv420ToNv21(image)
                    val yuvImage = YuvImage(nv21, ImageFormat.NV21, image.width, image.height, null)
                    val out = ByteArrayOutputStream()
                    yuvImage.compressToJpeg(Rect(0, 0, image.width, image.height), 60, out)
                    val jpegBytes = out.toByteArray()
                    val base64 = "data:image/jpeg;base64," + Base64.encodeToString(jpegBytes, Base64.NO_WRAP)

                    if (deviceId.isNotEmpty() && cameraRequested.get()) {
                        firestore.collection("childDevices").document(deviceId)
                            .update(mapOf(
                                "cameraStreaming" to true,
                                "latestFrame" to base64,
                                "updatedAt" to System.currentTimeMillis().toString()
                            ))
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                } finally {
                    image.close()
                }
            }, backgroundHandler)

            manager.openCamera(targetCameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    // Critical Lifecycle Check: If STOP_CAMERA occurred while waiting for hardware, close immediately!
                    if (!cameraRequested.get()) {
                        Log.d(TAG, "Camera opened after STOP_CAMERA; immediately closing CameraDevice")
                        camera.close()
                        cameraDevice = null
                        stopSelf()
                        return
                    }
                    cameraDevice = camera
                    startCaptureSession()
                }

                override fun onDisconnected(camera: CameraDevice) {
                    camera.close()
                    cameraDevice = null
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    camera.close()
                    cameraDevice = null
                    stopSelf()
                }
            }, backgroundHandler)

        } catch (e: SecurityException) {
            stopSelf()
        } catch (e: Exception) {
            stopSelf()
        }
    }

    private fun startCaptureSession() {
        if (!cameraRequested.get()) {
            cameraDevice?.close()
            cameraDevice = null
            return
        }

        val camera = cameraDevice ?: return
        val readerSurface = imageReader?.surface ?: return

        try {
            val builder = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                addTarget(readerSurface)
                set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)
            }

            camera.createCaptureSession(listOf(readerSurface), object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                    if (!cameraRequested.get()) {
                        session.close()
                        cameraDevice?.close()
                        cameraDevice = null
                        return
                    }
                    captureSession = session
                    try {
                        session.setRepeatingRequest(builder.build(), null, backgroundHandler)
                    } catch (e: CameraAccessException) {
                        e.printStackTrace()
                    }
                }

                override fun onConfigureFailed(session: CameraCaptureSession) {
                    stopSelf()
                }
            }, backgroundHandler)

        } catch (e: CameraAccessException) {
            e.printStackTrace()
        }
    }

    // Complete Hardware Release Lifecycle for STOP_CAMERA
    fun stopCameraInternal() {
        cameraRequested.set(false)

        try {
            captureSession?.stopRepeating()
        } catch (e: Exception) {
            // ignore
        }
        try {
            captureSession?.close()
        } catch (e: Exception) {
            // ignore
        }
        captureSession = null

        try {
            cameraDevice?.close()
        } catch (e: Exception) {
            // ignore
        }
        cameraDevice = null

        try {
            imageReader?.close()
        } catch (e: Exception) {
            // ignore
        }
        imageReader = null

        stopBackgroundThread()

        if (deviceId.isNotEmpty()) {
            try {
                firestore.collection("childDevices").document(deviceId)
                    .update(mapOf(
                        "cameraStreaming" to false,
                        "cameraState" to "STOPPED",
                        "cameraStatus" to "CAMERA_STOPPED"
                    ))
            } catch (e: Exception) {
                // ignore
            }
        }
    }

    private fun yuv420ToNv21(image: android.media.Image): ByteArray {
        val width = image.width
        val height = image.height
        val ySize = width * height
        val nv21 = ByteArray(ySize + (ySize / 2))

        val yBuffer = image.planes[0].buffer
        val uBuffer = image.planes[1].buffer
        val vBuffer = image.planes[2].buffer

        yBuffer.get(nv21, 0, ySize)

        val uRowStride = image.planes[1].rowStride
        val uPixelStride = image.planes[1].pixelStride
        val vRowStride = image.planes[2].rowStride
        val vPixelStride = image.planes[2].pixelStride

        var offset = ySize
        for (row in 0 until height / 2) {
            for (col in 0 until width / 2) {
                val vIndex = row * vRowStride + col * vPixelStride
                val uIndex = row * uRowStride + col * uPixelStride
                nv21[offset++] = vBuffer.get(vIndex)
                nv21[offset++] = uBuffer.get(uIndex)
            }
        }
        return nv21
    }

    override fun onDestroy() {
        super.onDestroy()
        stopCameraInternal()
        if (instance == this) {
            instance = null
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
