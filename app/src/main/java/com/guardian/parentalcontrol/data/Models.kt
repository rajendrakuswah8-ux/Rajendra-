package com.guardian.parentalcontrol.data

data class ChildDevice(
    val deviceId: String = "",
    val childAuthUid: String? = null,
    val guardianId: String = "",
    val childName: String = "",
    val deviceModel: String = "",
    val batteryLevel: Int? = null,
    val isCharging: Boolean? = null,
    val batterySupported: Boolean = true,
    val isOnline: Boolean = false,
    val lastSeen: Long = 0L,
    val networkStatus: String = "UNKNOWN",
    val flashlightState: String = "OFF",
    val cameraStreaming: Boolean = false,
    val audioStreaming: Boolean = false,
    val screenStreaming: Boolean = false,
    val location: DeviceLocation? = null,
    val permissions: PermissionMap = PermissionMap(),
    val screenTimeMinutes: Int = 0,
    val updatedAt: String = ""
)

data class DeviceLocation(
    val latitude: Double = 0.0,
    val longitude: Double = 0.0,
    val accuracy: Float = 0f,
    val timestamp: Long = 0L,
    val permissionStatus: String = "prompt",
    val errorMessage: String? = null
)

data class PermissionMap(
    val camera: String = "prompt",
    val microphone: String = "prompt",
    val location: String = "prompt",
    val notifications: String = "prompt",
    val screenCapture: String = "prompt"
)

data class PairingCode(
    val code: String = "",
    val guardianId: String = "",
    val guardianEmail: String = "",
    val guardianName: String = "",
    val expiresAt: Long = 0L,
    val isUsed: Boolean = false,
    val usedByDeviceId: String? = null,
    val createdAt: String = ""
)

data class DeviceCommand(
    val commandId: String = "",
    val deviceId: String = "",
    val guardianId: String = "",
    val type: String = "",
    val status: String = "PENDING",
    val payload: Map<String, Any> = emptyMap(),
    val response: CommandResponse? = null,
    val createdAt: String = "",
    val updatedAt: String = ""
)

data class CommandResponse(
    val status: String = "OK",
    val message: String? = null,
    val roundtripMs: Long = 0L,
    val timestamp: Long = 0L
)
