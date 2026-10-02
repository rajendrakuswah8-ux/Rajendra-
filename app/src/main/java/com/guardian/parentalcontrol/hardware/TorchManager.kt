package com.guardian.parentalcontrol.hardware

import android.content.Context
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager

class TorchManager(private val context: Context) {

    private val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
    private var cameraIdWithFlash: String? = null

    init {
        try {
            for (id in cameraManager.cameraIdList) {
                val characteristics = cameraManager.getCameraCharacteristics(id)
                val hasFlash = characteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
                val facing = characteristics.get(CameraCharacteristics.LENS_FACING)
                if (hasFlash && facing == CameraCharacteristics.LENS_FACING_BACK) {
                    cameraIdWithFlash = id
                    break
                }
            }
        } catch (e: CameraAccessException) {
            e.printStackTrace()
        }
    }

    fun isSupported(): Boolean = cameraIdWithFlash != null

    fun setTorch(enable: Boolean): Result<Boolean> {
        val id = cameraIdWithFlash ?: return Result.failure(IllegalStateException("No back camera with flash found"))
        return try {
            cameraManager.setTorchMode(id, enable)
            Result.success(enable)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
