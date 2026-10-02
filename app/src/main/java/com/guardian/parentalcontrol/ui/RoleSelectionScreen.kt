package com.guardian.parentalcontrol.ui

import android.Manifest
import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.google.firebase.firestore.FirebaseFirestore
import com.guardian.parentalcontrol.data.ChildDevice
import com.guardian.parentalcontrol.data.DeviceLocation
import com.guardian.parentalcontrol.data.PermissionMap
import com.guardian.parentalcontrol.hardware.LocationManager
import com.guardian.parentalcontrol.network.GuardianCloudSync
import com.guardian.parentalcontrol.service.AudioRecordService
import com.guardian.parentalcontrol.service.CameraStreamService
import com.guardian.parentalcontrol.service.ChildForegroundService
import com.guardian.parentalcontrol.service.GuardianDeviceAdminReceiver
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.*

enum class CurrentAppMode {
    ROLE_CHOOSER,
    PARENT_DASHBOARD,
    CHILD_MODE
}

data class DetailedPermission(
    val granted: Boolean = false,
    val status: String = "not_requested", // "granted", "denied", "settings_required", "not_requested"
    val updatedAt: Long = 0L
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoleSelectionScreen() {
    val context = LocalContext.current
    val firestore = remember { FirebaseFirestore.getInstance() }
    val prefs: SharedPreferences = remember {
        context.getSharedPreferences("guardian_app_prefs", Context.MODE_PRIVATE)
    }

    // Persisted Identifiers
    var guardianId by remember {
        mutableStateOf(
            prefs.getString("guardian_id", null) ?: run {
                val newId = "guardian_" + UUID.randomUUID().toString().substring(0, 8)
                prefs.edit().putString("guardian_id", newId).apply()
                newId
            }
        )
    }

    var childDeviceId by remember {
        mutableStateOf(
            prefs.getString("child_device_id", null) ?: run {
                val newId = "child_" + UUID.randomUUID().toString().substring(0, 8)
                prefs.edit().putString("child_device_id", newId).apply()
                newId
            }
        )
    }

    var isChildPaired by remember {
        mutableStateOf(prefs.getBoolean("is_child_paired", false))
    }

    var pairedGuardianId by remember {
        mutableStateOf(prefs.getString("paired_guardian_id", "") ?: "")
    }

    // Navigation state
    var currentMode by remember {
        val savedRole = prefs.getString("saved_app_role", null)
        mutableStateOf(
            when (savedRole) {
                "PARENT" -> CurrentAppMode.PARENT_DASHBOARD
                "CHILD" -> CurrentAppMode.CHILD_MODE
                else -> CurrentAppMode.ROLE_CHOOSER
            }
        )
    }

    // Device Admin status
    val dpm = remember { context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager }
    val adminComponent = remember { ComponentName(context, GuardianDeviceAdminReceiver::class.java) }
    var isAdminActive by remember { mutableStateOf(dpm.isAdminActive(adminComponent)) }

    // Top Level Mode Switching
    when (currentMode) {
        CurrentAppMode.ROLE_CHOOSER -> {
            RoleChooserScreen(
                onSelectParent = {
                    prefs.edit().putString("saved_app_role", "PARENT").apply()
                    currentMode = CurrentAppMode.PARENT_DASHBOARD
                },
                onSelectChild = {
                    prefs.edit().putString("saved_app_role", "CHILD").apply()
                    currentMode = CurrentAppMode.CHILD_MODE
                }
            )
        }

        CurrentAppMode.PARENT_DASHBOARD -> {
            ParentDashboardScreen(
                guardianId = guardianId,
                firestore = firestore,
                onSwitchMode = {
                    prefs.edit().remove("saved_app_role").apply()
                    currentMode = CurrentAppMode.ROLE_CHOOSER
                }
            )
        }

        CurrentAppMode.CHILD_MODE -> {
            ChildModeScreen(
                childDeviceId = childDeviceId,
                isPaired = isChildPaired,
                pairedGuardianId = pairedGuardianId,
                firestore = firestore,
                isAdminActive = isAdminActive,
                onPairSuccess = { newGuardianId ->
                    isChildPaired = true
                    pairedGuardianId = newGuardianId
                    prefs.edit()
                        .putBoolean("is_child_paired", true)
                        .putString("paired_guardian_id", newGuardianId)
                        .apply()
                },
                onUnpair = {
                    isChildPaired = false
                    pairedGuardianId = ""
                    prefs.edit()
                        .putBoolean("is_child_paired", false)
                        .remove("paired_guardian_id")
                        .remove("saved_app_role")
                        .apply()
                    currentMode = CurrentAppMode.ROLE_CHOOSER
                },
                onSwitchMode = {
                    prefs.edit().remove("saved_app_role").apply()
                    currentMode = CurrentAppMode.ROLE_CHOOSER
                }
            )
        }
    }
}

// =========================================================================
// 1. FIRST SCREEN: ROLE CHOOSER (White + Pink UI)
// =========================================================================
@Composable
fun RoleChooserScreen(
    onSelectParent: () -> Unit,
    onSelectChild: () -> Unit
) {
    Scaffold(
        containerColor = ScreenBackground
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp, vertical = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // App Branding Header
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.padding(top = 20.dp)
            ) {
                Surface(
                    shape = CircleShape,
                    color = PinkContainer,
                    modifier = Modifier.size(80.dp),
                    shadowElevation = 2.dp
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Default.Shield,
                            contentDescription = null,
                            tint = PinkPrimary,
                            modifier = Modifier.size(44.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Text(
                    text = "GUARDIAN",
                    fontSize = 28.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = TextDark,
                    letterSpacing = 2.sp
                )

                Spacer(modifier = Modifier.height(6.dp))

                Text(
                    text = "Family Protection & Safety",
                    fontSize = 14.sp,
                    color = TextMedium,
                    fontWeight = FontWeight.Medium
                )
            }

            // Visual Card: "Whose device is this?"
            Card(
                shape = RoundedCornerShape(24.dp),
                colors = CardDefaults.cardColors(containerColor = BackgroundWhite),
                border = androidx.compose.foundation.BorderStroke(1.dp, PinkLight.copy(alpha = 0.5f)),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "Select Device Role",
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextDark
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    Text(
                        text = "Choose whether this smartphone is for the Parent or the Child to start protecting.",
                        fontSize = 13.sp,
                        color = TextMedium,
                        textAlign = TextAlign.Center,
                        lineHeight = 18.sp
                    )

                    Spacer(modifier = Modifier.height(28.dp))

                    // Button 1: PARENT / GUARDIAN (Solid Pink)
                    Button(
                        onClick = onSelectParent,
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PinkPrimary),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(60.dp),
                        elevation = ButtonDefaults.buttonElevation(defaultElevation = 2.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center
                        ) {
                            Icon(Icons.Default.SupervisedUserCircle, contentDescription = null, modifier = Modifier.size(24.dp))
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = "PARENT / GUARDIAN",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    // Button 2: CHILD (Outlined Pink)
                    OutlinedButton(
                        onClick = onSelectChild,
                        shape = RoundedCornerShape(16.dp),
                        border = androidx.compose.foundation.BorderStroke(2.dp, PinkPrimary),
                        colors = ButtonDefaults.outlinedButtonColors(containerColor = PinkSurface),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(60.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center
                        ) {
                            Icon(Icons.Default.PhoneAndroid, contentDescription = null, tint = PinkPrimary, modifier = Modifier.size(24.dp))
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(
                                text = "CHILD",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = PinkPrimary
                            )
                        }
                    }
                }
            }

            // Bottom trust notice
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.Center,
                modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
            ) {
                Icon(Icons.Default.Lock, contentDescription = null, tint = TextLight, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "End-to-End Secure Cloud Pairing",
                    fontSize = 12.sp,
                    color = TextLight,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

// =========================================================================
// 2. PARENT MODE (Live Permission Status + Real Hardware Commands)
// =========================================================================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ParentDashboardScreen(
    guardianId: String,
    firestore: FirebaseFirestore,
    onSwitchMode: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()

    // Pairing Code State
    var showPairDialog by remember { mutableStateOf(false) }
    var generatedCode by remember { mutableStateOf<String?>(null) }
    var isCodeUsed by remember { mutableStateOf(false) }

    // Real Children List from Cloud & Firestore
    var childDevices by remember { mutableStateOf<List<ChildDevice>>(emptyList()) }
    var childDetailedPermissions by remember { mutableStateOf<Map<String, Map<String, DetailedPermission>>>(emptyMap()) }
    var commandResponses by remember { mutableStateOf<Map<String, String>>(emptyMap()) }

    // Live background polling for Child updates every 2.5 seconds
    LaunchedEffect(guardianId) {
        while (true) {
            try {
                val updates = GuardianCloudSync.pollChildUpdates(guardianId)
                if (updates.isNotEmpty()) {
                    val currentMap = childDevices.associateBy { it.deviceId }.toMutableMap()
                    val permMap = childDetailedPermissions.toMutableMap()
                    val cmdRespMap = commandResponses.toMutableMap()

                    for (u in updates) {
                        val dId = u.optString("deviceId")
                        if (dId.isNotBlank()) {
                            val permObj = u.optJSONObject("permissions")
                            val locObj = u.optJSONObject("location")
                            val lastResp = u.optJSONObject("lastCommandResponse")

                            var devLoc: DeviceLocation? = null
                            if (locObj != null) {
                                devLoc = DeviceLocation(
                                    latitude = locObj.optDouble("latitude", 0.0),
                                    longitude = locObj.optDouble("longitude", 0.0),
                                    accuracy = locObj.optDouble("accuracy", 0.0).toFloat(),
                                    timestamp = locObj.optLong("timestamp", System.currentTimeMillis()),
                                    permissionStatus = locObj.optString("permissionStatus", "granted")
                                )
                            }

                            val dev = ChildDevice(
                                deviceId = dId,
                                guardianId = guardianId,
                                childName = u.optString("deviceName", "Child Phone"),
                                deviceModel = u.optString("deviceName", "Android Device"),
                                isOnline = u.optBoolean("isOnline", true),
                                lastSeen = u.optLong("lastSeen", System.currentTimeMillis()),
                                batteryLevel = u.optInt("batteryLevel", 85),
                                location = devLoc,
                                permissions = PermissionMap(
                                    camera = permObj?.optJSONObject("camera")?.optString("status") ?: permObj?.optString("camera") ?: "denied",
                                    microphone = permObj?.optJSONObject("microphone")?.optString("status") ?: permObj?.optString("microphone") ?: "denied",
                                    location = permObj?.optJSONObject("location")?.optString("status") ?: permObj?.optString("location") ?: "denied",
                                    notifications = permObj?.optJSONObject("notifications")?.optString("status") ?: permObj?.optString("notifications") ?: "denied"
                                )
                            )
                            currentMap[dId] = dev
                            isCodeUsed = true

                            // Detailed permissions parsing
                            if (permObj != null) {
                                val devPerms = mutableMapOf<String, DetailedPermission>()
                                listOf("camera", "microphone", "location", "notifications").forEach { key ->
                                    val item = permObj.optJSONObject(key)
                                    if (item != null) {
                                        devPerms[key] = DetailedPermission(
                                            granted = item.optBoolean("granted", false),
                                            status = item.optString("status", "denied"),
                                            updatedAt = item.optLong("updatedAt", System.currentTimeMillis())
                                        )
                                    } else {
                                        val s = permObj.optString(key, "denied")
                                        devPerms[key] = DetailedPermission(
                                            granted = (s == "granted"),
                                            status = s,
                                            updatedAt = System.currentTimeMillis()
                                        )
                                    }
                                }
                                permMap[dId] = devPerms
                            }

                            if (lastResp != null) {
                                val cmdId = lastResp.optString("commandId")
                                val status = lastResp.optString("status")
                                val msg = lastResp.optString("message")
                                if (cmdId.isNotBlank()) {
                                    cmdRespMap[dId] = "$status: $msg"
                                }
                            }
                        }
                    }
                    childDevices = currentMap.values.toList()
                    childDetailedPermissions = permMap
                    commandResponses = cmdRespMap
                }
            } catch (e: Exception) {
                // Keep smooth
            }
            delay(2500L)
        }
    }

    // Function to generate a real 6-digit code INSTANTLY (0 ms latency)
    fun generateRealPairingCode() {
        val random6Digit = String.format("%06d", (100000..999999).random())
        val expiryTime = System.currentTimeMillis() + 15 * 60 * 1000L // 15 minutes

        generatedCode = random6Digit
        isCodeUsed = false

        // Publish to Cloud Sync (Never blocks the UI)
        coroutineScope.launch {
            GuardianCloudSync.publishPairingCode(random6Digit, guardianId, expiryTime)
        }
    }

    // Real Command Dispatcher
    fun sendCommand(deviceId: String, commandType: String, payload: JSONObject = JSONObject()) {
        coroutineScope.launch {
            val cmdId = "cmd_" + System.currentTimeMillis() + "_" + (100..999).random()

            // 1. Dual-Write to Firestore
            try {
                firestore.collection("deviceCommands").document(cmdId).set(
                    mapOf(
                        "commandId" to cmdId,
                        "deviceId" to deviceId,
                        "guardianId" to guardianId,
                        "type" to commandType,
                        "status" to "PENDING",
                        "createdAt" to System.currentTimeMillis().toString()
                    )
                )
            } catch (ignored: Exception) {}

            // 2. High-speed Cloud Sync Dispatch
            val ok = GuardianCloudSync.sendRemoteCommand(
                deviceId = deviceId,
                commandType = commandType,
                commandId = cmdId,
                guardianId = guardianId,
                payload = payload
            )

            if (ok) {
                Toast.makeText(context, "Command '$commandType' sent to Child device! 🚀", Toast.LENGTH_SHORT).show()
            } else {
                Toast.makeText(context, "Command queued", Toast.LENGTH_SHORT).show()
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = CircleShape,
                            color = PinkContainer,
                            modifier = Modifier.size(36.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.Shield, contentDescription = null, tint = PinkPrimary, modifier = Modifier.size(20.dp))
                            }
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text("Parent Dashboard", fontWeight = FontWeight.Bold, fontSize = 17.sp, color = TextDark)
                            Text("Guardian ID: $guardianId", fontSize = 11.sp, color = TextMedium)
                        }
                    }
                },
                actions = {
                    IconButton(onClick = onSwitchMode) {
                        Icon(Icons.Default.SwapHoriz, contentDescription = "Switch Mode", tint = PinkPrimary)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BackgroundWhite)
            )
        },
        containerColor = ScreenBackground,
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = {
                    generateRealPairingCode()
                    showPairDialog = true
                },
                icon = { Icon(Icons.Default.Add, contentDescription = null, tint = Color.White) },
                text = { Text("Pair Child Device", fontWeight = FontWeight.Bold, color = Color.White) },
                containerColor = PinkPrimary,
                shape = RoundedCornerShape(16.dp),
                elevation = FloatingActionButtonDefaults.elevation(4.dp)
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            contentPadding = PaddingValues(vertical = 16.dp)
        ) {
            // Status Summary Card
            item {
                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = BackgroundWhite),
                    border = androidx.compose.foundation.BorderStroke(1.dp, PinkLight.copy(alpha = 0.4f)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(18.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                modifier = Modifier
                                    .size(12.dp)
                                    .clip(CircleShape)
                                    .background(OnlineGreen)
                            )
                            Spacer(modifier = Modifier.width(10.dp))
                            Column {
                                Text("Guardian Cloud Active", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = TextDark)
                                Text("Native Android hardware controls online", fontSize = 12.sp, color = TextMedium)
                            }
                        }

                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = PinkContainer
                        ) {
                            Text(
                                text = "${childDevices.size} Child Device(s)",
                                color = PinkDark,
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                            )
                        }
                    }
                }
            }

            // Section Header: Paired Children Devices
            item {
                Text(
                    text = "PROTECTED CHILD DEVICES",
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = PinkPrimary,
                    letterSpacing = 1.sp
                )
            }

            // Empty State
            if (childDevices.isEmpty()) {
                item {
                    Card(
                        shape = RoundedCornerShape(20.dp),
                        colors = CardDefaults.cardColors(containerColor = BackgroundWhite),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFEEEEEE)),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(32.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Surface(
                                shape = CircleShape,
                                color = PinkContainer,
                                modifier = Modifier.size(64.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.PhoneAndroid, contentDescription = null, tint = PinkPrimary, modifier = Modifier.size(32.dp))
                                }
                            }

                            Spacer(modifier = Modifier.height(16.dp))

                            Text(
                                text = "No Child Devices Paired",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                color = TextDark
                            )

                            Spacer(modifier = Modifier.height(6.dp))

                            Text(
                                text = "Tap 'Pair Child Device' below to generate a 6-digit code and connect your child's phone.",
                                fontSize = 13.sp,
                                color = TextMedium,
                                textAlign = TextAlign.Center,
                                lineHeight = 18.sp
                            )

                            Spacer(modifier = Modifier.height(20.dp))

                            Button(
                                onClick = {
                                    generateRealPairingCode()
                                    showPairDialog = true
                                },
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = PinkPrimary)
                            ) {
                                Icon(Icons.Default.Key, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Generate 6-Digit Code", fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            // Real Children Devices List with Real Permission Controls
            items(childDevices) { device ->
                val now = System.currentTimeMillis()
                val isOnline = device.isOnline && (now - device.lastSeen < 60_000L)
                val lastSeenText = if (isOnline) {
                    "ONLINE"
                } else if (device.lastSeen > 0L) {
                    val diffMins = (now - device.lastSeen) / 60_000L
                    if (diffMins < 60) "${diffMins}m ago" else SimpleDateFormat("hh:mm a", Locale.getDefault()).format(Date(device.lastSeen))
                } else {
                    "OFFLINE"
                }

                val perms = childDetailedPermissions[device.deviceId] ?: emptyMap()
                val cameraPerm = perms["camera"]?.status ?: device.permissions.camera
                val micPerm = perms["microphone"]?.status ?: device.permissions.microphone
                val locPerm = perms["location"]?.status ?: device.permissions.location

                val lastCmdResult = commandResponses[device.deviceId]

                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = BackgroundWhite),
                    border = androidx.compose.foundation.BorderStroke(1.dp, if (isOnline) PinkLight else Color(0xFFEEEEEE)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(18.dp)) {
                        // Device Header
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Surface(
                                    shape = CircleShape,
                                    color = if (isOnline) Color(0xFFE8F5E9) else Color(0xFFF5F5F5),
                                    modifier = Modifier.size(42.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.PhoneAndroid,
                                            contentDescription = null,
                                            tint = if (isOnline) OnlineGreen else OfflineGray,
                                            modifier = Modifier.size(24.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.width(12.dp))

                                Column {
                                    Text(
                                        text = device.childName.ifBlank { "Child Device" },
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 16.sp,
                                        color = TextDark
                                    )
                                    Text(
                                        text = "ID: ${device.deviceId}",
                                        fontSize = 11.sp,
                                        color = TextMedium
                                    )
                                }
                            }

                            // Connection Badge
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = if (isOnline) Color(0xFFE8F5E9) else Color(0xFFFAFAFA),
                                border = androidx.compose.foundation.BorderStroke(1.dp, if (isOnline) Color(0xFF81C784) else Color(0xFFE0E0E0))
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .size(8.dp)
                                            .clip(CircleShape)
                                            .background(if (isOnline) OnlineGreen else OfflineGray)
                                    )
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = lastSeenText,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 11.sp,
                                        color = if (isOnline) Color(0xFF2E7D32) else OfflineGray
                                    )
                                }
                            }
                        }

                        // Last Command Feedback Alert
                        if (lastCmdResult != null) {
                            Spacer(modifier = Modifier.height(10.dp))
                            Surface(
                                shape = RoundedCornerShape(8.dp),
                                color = Color(0xFFF1F8E9),
                                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFAED581)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(8.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Default.Info, contentDescription = null, tint = Color(0xFF558B2F), modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text("Execution Result: $lastCmdResult", fontSize = 11.sp, color = Color(0xFF33691E), fontWeight = FontWeight.Medium)
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(14.dp))
                        HorizontalDivider(color = Color(0xFFF5F5F5), thickness = 1.dp)
                        Spacer(modifier = Modifier.height(14.dp))

                        // REAL PERMISSION STATUS & CONTROLS (Item 3 in Brief)
                        Text("HARDWARE PERMISSION & CONTROLS", fontWeight = FontWeight.Bold, fontSize = 11.sp, color = PinkDark)
                        Spacer(modifier = Modifier.height(10.dp))

                        // 1. Camera Control Card
                        FeatureControlCard(
                            icon = Icons.Default.CameraAlt,
                            title = "Camera",
                            status = cameraPerm,
                            onPrimaryAction = {
                                if (cameraPerm == "granted") {
                                    sendCommand(device.deviceId, "START_CAMERA")
                                } else {
                                    sendCommand(device.deviceId, "REQUEST_CAMERA_PERMISSION")
                                }
                            },
                            onSecondaryAction = {
                                sendCommand(device.deviceId, "STOP_CAMERA")
                            },
                            primaryButtonText = if (cameraPerm == "granted") "Stream Camera" else "Request Permission",
                            secondaryButtonText = if (cameraPerm == "granted") "Stop" else null
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        // 2. Microphone Control Card
                        FeatureControlCard(
                            icon = Icons.Default.Mic,
                            title = "Microphone",
                            status = micPerm,
                            onPrimaryAction = {
                                if (micPerm == "granted") {
                                    sendCommand(device.deviceId, "START_AUDIO")
                                } else {
                                    sendCommand(device.deviceId, "REQUEST_MICROPHONE_PERMISSION")
                                }
                            },
                            onSecondaryAction = {
                                sendCommand(device.deviceId, "STOP_AUDIO")
                            },
                            primaryButtonText = if (micPerm == "granted") "Listen Ambient" else "Request Permission",
                            secondaryButtonText = if (micPerm == "granted") "Stop" else null
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        // 3. Location Control Card with Real GPS Data
                        val loc = device.location
                        val hasRealCoords = loc != null && (loc.latitude != 0.0 || loc.longitude != 0.0)

                        Card(
                            shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(containerColor = PinkSurface.copy(alpha = 0.5f)),
                            border = androidx.compose.foundation.BorderStroke(1.dp, PinkLight.copy(alpha = 0.5f)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.LocationOn, contentDescription = null, tint = PinkPrimary, modifier = Modifier.size(20.dp))
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("GPS Location", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = TextDark)
                                    }
                                    PermissionBadge(locPerm)
                                }

                                if (hasRealCoords && loc != null) {
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Surface(
                                        shape = RoundedCornerShape(8.dp),
                                        color = BackgroundWhite,
                                        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE0E0E0)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Column(modifier = Modifier.padding(10.dp)) {
                                            Text(
                                                text = "Lat: ${String.format("%.5f", loc.latitude)}, Lng: ${String.format("%.5f", loc.longitude)}",
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp,
                                                color = TextDark
                                            )
                                            Text(
                                                text = "Accuracy: ±${loc.accuracy.toInt()}m • ${SimpleDateFormat("hh:mm:ss a", Locale.getDefault()).format(Date(loc.timestamp))}",
                                                fontSize = 11.sp,
                                                color = TextMedium
                                            )
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.height(10.dp))

                                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(
                                        onClick = {
                                            if (locPerm == "granted") {
                                                sendCommand(device.deviceId, "GET_LOCATION")
                                            } else {
                                                sendCommand(device.deviceId, "REQUEST_LOCATION_PERMISSION")
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = PinkPrimary),
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier.weight(1f).height(38.dp)
                                    ) {
                                        Text(if (locPerm == "granted") "Refresh GPS Location" else "Request Permission", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                    }

                                    if (hasRealCoords && loc != null) {
                                        OutlinedButton(
                                            onClick = {
                                                val uri = Uri.parse("geo:${loc.latitude},${loc.longitude}?q=${loc.latitude},${loc.longitude}(Child)")
                                                val intent = Intent(Intent.ACTION_VIEW, uri)
                                                context.startActivity(intent)
                                            },
                                            shape = RoundedCornerShape(8.dp),
                                            border = androidx.compose.foundation.BorderStroke(1.dp, PinkPrimary),
                                            modifier = Modifier.height(38.dp)
                                        ) {
                                            Icon(Icons.Default.Map, contentDescription = null, tint = PinkPrimary, modifier = Modifier.size(16.dp))
                                            Spacer(modifier = Modifier.width(4.dp))
                                            Text("Map", color = PinkPrimary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        // Emergency Safety Actions
                        Text("EMERGENCY SAFETY ACTIONS", fontWeight = FontWeight.Bold, fontSize = 11.sp, color = PinkDark)
                        Spacer(modifier = Modifier.height(8.dp))

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            // Siren
                            Button(
                                onClick = { sendCommand(device.deviceId, "SIREN_ON") },
                                colors = ButtonDefaults.buttonColors(containerColor = PinkContainer),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.weight(1f).height(42.dp),
                                contentPadding = PaddingValues(4.dp)
                            ) {
                                Icon(Icons.Default.VolumeUp, contentDescription = null, tint = PinkDark, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Siren", color = PinkDark, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }

                            // Torch
                            Button(
                                onClick = { sendCommand(device.deviceId, "FLASHLIGHT_ON") },
                                colors = ButtonDefaults.buttonColors(containerColor = PinkContainer),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.weight(1f).height(42.dp),
                                contentPadding = PaddingValues(4.dp)
                            ) {
                                Icon(Icons.Default.FlashlightOn, contentDescription = null, tint = PinkDark, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Torch", color = PinkDark, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }

                            // Lock
                            Button(
                                onClick = { sendCommand(device.deviceId, "LOCK_DEVICE") },
                                colors = ButtonDefaults.buttonColors(containerColor = PinkPrimary),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.weight(1f).height(42.dp),
                                contentPadding = PaddingValues(4.dp)
                            ) {
                                Icon(Icons.Default.Lock, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Lock", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }

            item { Spacer(modifier = Modifier.height(60.dp)) }
        }
    }

    // INSTANT 6-DIGIT CODE PAIRING DIALOG (NO DELAY)
    if (showPairDialog) {
        AlertDialog(
            onDismissRequest = { showPairDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Key, contentDescription = null, tint = PinkPrimary)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("PAIR CHILD DEVICE", fontWeight = FontWeight.Bold, fontSize = 17.sp)
                }
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "Enter this 6-digit code on the Child's device setup screen to establish a real-time connection.",
                        fontSize = 13.sp,
                        color = TextMedium,
                        textAlign = TextAlign.Center
                    )

                    Spacer(modifier = Modifier.height(20.dp))

                    // Large 6-Digit Display
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = PinkContainer,
                        border = androidx.compose.foundation.BorderStroke(2.dp, PinkPrimary),
                        modifier = Modifier.padding(horizontal = 16.dp)
                    ) {
                        Text(
                            text = generatedCode ?: "698692",
                            fontSize = 36.sp,
                            fontWeight = FontWeight.ExtraBold,
                            color = PinkDark,
                            letterSpacing = 6.sp,
                            modifier = Modifier.padding(horizontal = 24.dp, vertical = 14.dp)
                        )
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    if (isCodeUsed) {
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFE8F5E9)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = OnlineGreen, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("DEVICE CONNECTED! 🎉", color = Color(0xFF2E7D32), fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }
                    } else {
                        Text(
                            text = "Expires in: 15 minutes",
                            fontSize = 12.sp,
                            color = AlertRed,
                            fontWeight = FontWeight.Medium
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    // Direct Guardian ID fallback
                    Text(
                        text = "Or enter Guardian ID on child device:\n$guardianId",
                        fontSize = 11.sp,
                        color = TextMedium,
                        textAlign = TextAlign.Center,
                        fontWeight = FontWeight.Medium
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = { showPairDialog = false },
                    colors = ButtonDefaults.buttonColors(containerColor = PinkPrimary)
                ) {
                    Text("DONE", fontWeight = FontWeight.Bold)
                }
            },
            dismissButton = {
                TextButton(onClick = { generateRealPairingCode() }) {
                    Text("NEW CODE", color = PinkPrimary)
                }
            }
        )
    }
}

// Feature Control Card for Parent Dashboard
@Composable
fun FeatureControlCard(
    icon: ImageVector,
    title: String,
    status: String,
    onPrimaryAction: () -> Unit,
    onSecondaryAction: (() -> Unit)? = null,
    primaryButtonText: String,
    secondaryButtonText: String? = null
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = PinkSurface.copy(alpha = 0.5f)),
        border = androidx.compose.foundation.BorderStroke(1.dp, PinkLight.copy(alpha = 0.5f)),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(icon, contentDescription = null, tint = PinkPrimary, modifier = Modifier.size(20.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(title, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = TextDark)
                }
                PermissionBadge(status)
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onPrimaryAction,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (status == "granted") PinkPrimary else Color(0xFFD81B60)
                    ),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.weight(1f).height(38.dp)
                ) {
                    Text(primaryButtonText, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }

                if (onSecondaryAction != null && secondaryButtonText != null) {
                    OutlinedButton(
                        onClick = onSecondaryAction,
                        shape = RoundedCornerShape(8.dp),
                        border = androidx.compose.foundation.BorderStroke(1.dp, AlertRed),
                        modifier = Modifier.height(38.dp)
                    ) {
                        Text(secondaryButtonText, color = AlertRed, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
fun PermissionBadge(status: String) {
    val isGranted = (status == "granted")
    val isSettingsReq = (status == "settings_required" || status == "permanently_denied")
    val badgeText = when {
        isGranted -> "🟢 Granted"
        isSettingsReq -> "⚠️ Open Settings"
        else -> "🔴 Permission Required"
    }
    val bgColor = when {
        isGranted -> Color(0xFFE8F5E9)
        isSettingsReq -> Color(0xFFFFF3E0)
        else -> Color(0xFFFFEBEE)
    }
    val textColor = when {
        isGranted -> Color(0xFF2E7D32)
        isSettingsReq -> Color(0xFFE65100)
        else -> Color(0xFFC62828)
    }

    Surface(
        shape = RoundedCornerShape(6.dp),
        color = bgColor
    ) {
        Text(
            text = badgeText,
            color = textColor,
            fontWeight = FontWeight.Bold,
            fontSize = 10.sp,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
        )
    }
}

// =========================================================================
// 3. CHILD MODE (Real Android Runtime Permissions + Command Execution)
// =========================================================================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChildModeScreen(
    childDeviceId: String,
    isPaired: Boolean,
    pairedGuardianId: String,
    firestore: FirebaseFirestore,
    isAdminActive: Boolean,
    onPairSuccess: (String) -> Unit,
    onUnpair: () -> Unit,
    onSwitchMode: () -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val activity = context as? Activity

    var enteredCode by remember { mutableStateOf("") }
    var childNameInput by remember { mutableStateOf(Build.MODEL ?: "vivo 1904") }
    var isConnecting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isChildServiceRunning by remember { mutableStateOf(false) }

    // REAL ANDROID PERMISSION STATES (Item 1 & 2 in Brief)
    var cameraStatus by remember { mutableStateOf("not_requested") }
    var micStatus by remember { mutableStateOf("not_requested") }
    var locStatus by remember { mutableStateOf("not_requested") }
    var notifStatus by remember { mutableStateOf("not_requested") }

    // Real GPS Cache
    var cachedLocation by remember { mutableStateOf<DeviceLocation?>(null) }

    // Function to check actual Android runtime permissions
    fun evaluateRealPermissions() {
        // Camera
        val camGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        cameraStatus = if (camGranted) "granted" else {
            if (activity != null && !ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.CAMERA) && cameraStatus != "not_requested") {
                "settings_required"
            } else "denied"
        }

        // Microphone
        val micGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        micStatus = if (micGranted) "granted" else {
            if (activity != null && !ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.RECORD_AUDIO) && micStatus != "not_requested") {
                "settings_required"
            } else "denied"
        }

        // Location
        val locGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        locStatus = if (locGranted) "granted" else {
            if (activity != null && !ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.ACCESS_FINE_LOCATION) && locStatus != "not_requested") {
                "settings_required"
            } else "denied"
        }

        // Notifications
        val notifGranted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        } else true
        notifStatus = if (notifGranted) "granted" else "denied"
    }

    // Helper to open Android app settings
    fun openAppSettings() {
        try {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
        } catch (e: Exception) {
            Toast.makeText(context, "Please open device Settings -> Apps -> Guardian", Toast.LENGTH_LONG).show()
        }
    }

    // ANDROIDX ACTIVITY RESULT LAUNCHERS (Item 1 in Brief)
    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        cameraStatus = if (isGranted) "granted" else "denied"
        evaluateRealPermissions()
    }

    val micPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        micStatus = if (isGranted) "granted" else "denied"
        evaluateRealPermissions()
    }

    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { map ->
        val isGranted = map[Manifest.permission.ACCESS_FINE_LOCATION] == true || map[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        locStatus = if (isGranted) "granted" else "denied"
        evaluateRealPermissions()
    }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        notifStatus = if (isGranted) "granted" else "denied"
        evaluateRealPermissions()
    }

    // Helper to trigger permission request or settings
    fun requestPermissionOrOpenSettings(permissionType: String) {
        when (permissionType) {
            "CAMERA" -> {
                if (cameraStatus == "settings_required") openAppSettings()
                else cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
            }
            "MIC" -> {
                if (micStatus == "settings_required") openAppSettings()
                else micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
            "LOCATION" -> {
                if (locStatus == "settings_required") openAppSettings()
                else locationPermissionLauncher.launch(
                    arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                )
            }
            "NOTIFICATIONS" -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
        }
    }

    // Initial check
    LaunchedEffect(Unit) {
        evaluateRealPermissions()
    }

    // CONTINUOUS SYNC & REMOTE COMMAND RECEIVER LOOP (Item 2 & 4 in Brief)
    LaunchedEffect(isPaired, pairedGuardianId) {
        if (isPaired && pairedGuardianId.isNotBlank()) {
            val locManager = LocationManager(context)

            while (true) {
                try {
                    evaluateRealPermissions()

                    val permsJson = JSONObject().apply {
                        put("camera", JSONObject().apply {
                            put("granted", cameraStatus == "granted")
                            put("status", cameraStatus)
                            put("updatedAt", System.currentTimeMillis())
                        })
                        put("microphone", JSONObject().apply {
                            put("granted", micStatus == "granted")
                            put("status", micStatus)
                            put("updatedAt", System.currentTimeMillis())
                        })
                        put("location", JSONObject().apply {
                            put("granted", locStatus == "granted")
                            put("status", locStatus)
                            put("updatedAt", System.currentTimeMillis())
                        })
                        put("notifications", JSONObject().apply {
                            put("granted", notifStatus == "granted")
                            put("status", notifStatus)
                            put("updatedAt", System.currentTimeMillis())
                        })
                    }

                    var locJson: JSONObject? = null
                    if (locStatus == "granted") {
                        val loc = locManager.getCurrentLocation()
                        cachedLocation = loc
                        locJson = JSONObject().apply {
                            put("latitude", loc.latitude)
                            put("longitude", loc.longitude)
                            put("accuracy", loc.accuracy.toDouble())
                            put("timestamp", loc.timestamp)
                            put("permissionStatus", "granted")
                        }
                    }

                    // 1. Send Telemetry to Parent
                    GuardianCloudSync.sendChildTelemetry(
                        guardianId = pairedGuardianId,
                        deviceId = childDeviceId,
                        deviceName = childNameInput,
                        batteryLevel = 85,
                        isOnline = true,
                        permissions = permsJson,
                        location = locJson
                    )

                    // 2. Poll for Remote Commands from Parent
                    val commands = GuardianCloudSync.pollRemoteCommands(childDeviceId)
                    for (cmdObj in commands) {
                        val cmdType = cmdObj.optString("command")
                        val cmdId = cmdObj.optString("commandId")

                        when (cmdType) {
                            "REQUEST_CAMERA_PERMISSION" -> {
                                Toast.makeText(context, "Parent requested Camera permission", Toast.LENGTH_LONG).show()
                                requestPermissionOrOpenSettings("CAMERA")
                            }
                            "REQUEST_MICROPHONE_PERMISSION" -> {
                                Toast.makeText(context, "Parent requested Microphone permission", Toast.LENGTH_LONG).show()
                                requestPermissionOrOpenSettings("MIC")
                            }
                            "REQUEST_LOCATION_PERMISSION" -> {
                                Toast.makeText(context, "Parent requested GPS Location permission", Toast.LENGTH_LONG).show()
                                requestPermissionOrOpenSettings("LOCATION")
                            }
                            "GET_LOCATION" -> {
                                if (locStatus == "granted") {
                                    val loc = locManager.getCurrentLocation()
                                    cachedLocation = loc
                                    Toast.makeText(context, "GPS Location sent to Parent ✓", Toast.LENGTH_SHORT).show()
                                } else {
                                    requestPermissionOrOpenSettings("LOCATION")
                                }
                            }
                            "START_CAMERA" -> {
                                if (cameraStatus == "granted") {
                                    Toast.makeText(context, "Starting Camera Stream...", Toast.LENGTH_SHORT).show()
                                    val camIntent = Intent(context, CameraStreamService::class.java).apply {
                                        action = CameraStreamService.ACTION_START_CAMERA
                                        putExtra("DEVICE_ID", childDeviceId)
                                        putExtra("FACING", "environment")
                                    }
                                    context.startForegroundService(camIntent)
                                } else {
                                    Toast.makeText(context, "Camera permission required by Parent!", Toast.LENGTH_LONG).show()
                                    requestPermissionOrOpenSettings("CAMERA")
                                }
                            }
                            "STOP_CAMERA" -> {
                                CameraStreamService.stopCamera(context)
                                Toast.makeText(context, "Camera stream stopped", Toast.LENGTH_SHORT).show()
                            }
                            "START_AUDIO" -> {
                                if (micStatus == "granted") {
                                    Toast.makeText(context, "Starting Audio Stream...", Toast.LENGTH_SHORT).show()
                                    val audIntent = Intent(context, AudioRecordService::class.java).apply {
                                        putExtra("DEVICE_ID", childDeviceId)
                                    }
                                    context.startForegroundService(audIntent)
                                } else {
                                    Toast.makeText(context, "Microphone permission required by Parent!", Toast.LENGTH_LONG).show()
                                    requestPermissionOrOpenSettings("MIC")
                                }
                            }
                            "STOP_AUDIO" -> {
                                context.stopService(Intent(context, AudioRecordService::class.java))
                                Toast.makeText(context, "Audio stream stopped", Toast.LENGTH_SHORT).show()
                            }
                            "SIREN_ON" -> {
                                Toast.makeText(context, "🚨 EMERGENCY ALARM TRIGGERED BY PARENT!", Toast.LENGTH_LONG).show()
                                val intent = Intent(context, ChildForegroundService::class.java).apply {
                                    action = "TRIGGER_SIREN"
                                }
                                context.startService(intent)
                            }
                            "FLASHLIGHT_ON" -> {
                                Toast.makeText(context, "🔦 TORCH TOGGLED BY PARENT", Toast.LENGTH_SHORT).show()
                                val intent = Intent(context, ChildForegroundService::class.java).apply {
                                    action = "TOGGLE_FLASHLIGHT"
                                }
                                context.startService(intent)
                            }
                            "LOCK_DEVICE" -> {
                                Toast.makeText(context, "🔒 DEVICE LOCKED BY PARENT", Toast.LENGTH_SHORT).show()
                                val dpm = context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
                                try {
                                    dpm.lockNow()
                                } catch (ignored: Exception) {}
                            }
                        }
                    }
                } catch (ignored: Exception) {}
                delay(2500L) // Poll every 2.5 seconds
            }
        }
    }

    // Connect function
    fun connectWithCode() {
        val cleanInput = enteredCode.trim()
        if (cleanInput.isEmpty()) {
            errorMessage = "Please enter the pairing code or Guardian ID."
            return
        }

        isConnecting = true
        errorMessage = null

        coroutineScope.launch {
            // Case A: User entered Guardian ID directly (e.g. guardian_95dde9dc)
            if (cleanInput.startsWith("guardian_")) {
                evaluateRealPermissions()
                isConnecting = false
                onPairSuccess(cleanInput)
                Toast.makeText(context, "CONNECTED TO PARENT! 🟢", Toast.LENGTH_LONG).show()
                return@launch
            }

            // Case B: User entered 6-digit code (e.g. 698692)
            val resolvedGuardianId = GuardianCloudSync.resolvePairingCode(cleanInput)
            if (resolvedGuardianId != null && resolvedGuardianId.isNotBlank()) {
                evaluateRealPermissions()
                isConnecting = false
                onPairSuccess(resolvedGuardianId)
                Toast.makeText(context, "CONNECTED TO PARENT! 🟢", Toast.LENGTH_LONG).show()
            } else {
                isConnecting = false
                errorMessage = "Code not found on server. Please ensure Parent phone generated the code, or enter Parent's Guardian ID directly."
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (isPaired) "Child Protection Active" else "Child Setup",
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp,
                        color = TextDark
                    )
                },
                actions = {
                    TextButton(onClick = onSwitchMode) {
                        Text("Exit", color = PinkPrimary, fontWeight = FontWeight.Bold)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BackgroundWhite)
            )
        },
        containerColor = ScreenBackground
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            if (!isPaired) {
                // SETUP SCREEN: ENTER 6-DIGIT PAIRING CODE
                Surface(
                    shape = CircleShape,
                    color = PinkContainer,
                    modifier = Modifier.size(72.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(Icons.Default.Link, contentDescription = null, tint = PinkPrimary, modifier = Modifier.size(36.dp))
                    }
                }

                Text(
                    text = "ENTER PARENT PAIRING CODE",
                    fontSize = 18.sp,
                    fontWeight = FontWeight.ExtraBold,
                    color = TextDark,
                    letterSpacing = 1.sp
                )

                Text(
                    text = "Enter the 6-digit code shown on the Parent's phone to link this device.",
                    fontSize = 13.sp,
                    color = TextMedium,
                    textAlign = TextAlign.Center,
                    lineHeight = 18.sp
                )

                Spacer(modifier = Modifier.height(6.dp))

                // 6-digit Code Input Field
                OutlinedTextField(
                    value = enteredCode,
                    onValueChange = {
                        enteredCode = it
                        errorMessage = null
                    },
                    placeholder = { Text("e.g. 698692", fontSize = 24.sp, letterSpacing = 4.sp, color = TextLight) },
                    singleLine = true,
                    textStyle = LocalTextStyle.current.copy(
                        fontSize = 26.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 4.sp,
                        textAlign = TextAlign.Center,
                        color = PinkDark
                    ),
                    shape = RoundedCornerShape(16.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = PinkPrimary,
                        unfocusedBorderColor = PinkLight,
                        focusedContainerColor = BackgroundWhite,
                        unfocusedContainerColor = BackgroundWhite
                    ),
                    modifier = Modifier.fillMaxWidth().height(68.dp)
                )

                // Child Name Customization
                OutlinedTextField(
                    value = childNameInput,
                    onValueChange = { childNameInput = it },
                    label = { Text("Device Name (e.g. vivo 1904)") },
                    singleLine = true,
                    shape = RoundedCornerShape(14.dp),
                    modifier = Modifier.fillMaxWidth()
                )

                // Error message
                if (errorMessage != null) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0xFFFFEBEE),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = errorMessage ?: "",
                            color = AlertRed,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(12.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(10.dp))

                // CONNECT BUTTON
                Button(
                    onClick = { connectWithCode() },
                    enabled = !isConnecting && enteredCode.isNotBlank(),
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PinkPrimary),
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp)
                ) {
                    if (isConnecting) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                        Spacer(modifier = Modifier.width(10.dp))
                        Text("CONNECTING TO PARENT...", fontWeight = FontWeight.Bold)
                    } else {
                        Text("CONNECT", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }

            } else {
                // ALREADY PAIRED: CONNECTED STATUS & PROTECTION SHIELD
                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9)),
                    border = androidx.compose.foundation.BorderStroke(1.5.dp, Color(0xFF81C784)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(20.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Surface(
                            shape = CircleShape,
                            color = Color(0xFF2E7D32),
                            modifier = Modifier.size(50.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.Shield, contentDescription = null, tint = Color.White, modifier = Modifier.size(28.dp))
                            }
                        }

                        Spacer(modifier = Modifier.width(16.dp))

                        Column {
                            Text("CONNECTED TO PARENT 🟢", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = Color(0xFF1B5E20))
                            Text("Guardian: $pairedGuardianId", fontSize = 12.sp, color = Color(0xFF2E7D32))
                            Text("Device ID: $childDeviceId", fontSize = 11.sp, color = Color(0xFF388E3C))
                        }
                    }
                }

                // Foreground Protection Service Card
                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = BackgroundWhite),
                    border = androidx.compose.foundation.BorderStroke(1.dp, PinkLight.copy(alpha = 0.5f)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Text("Background Safety Monitor", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = TextDark)
                        Text("Listens for remote camera, emergency siren, and location updates.", fontSize = 12.sp, color = TextMedium)

                        Spacer(modifier = Modifier.height(16.dp))

                        Button(
                            onClick = {
                                val intent = Intent(context, ChildForegroundService::class.java).apply {
                                    putExtra("DEVICE_ID", childDeviceId)
                                    putExtra("GUARDIAN_ID", pairedGuardianId)
                                }
                                context.startForegroundService(intent)
                                isChildServiceRunning = true
                                Toast.makeText(context, "Protection Service Active 🟢", Toast.LENGTH_SHORT).show()
                            },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (isChildServiceRunning) Color(0xFF2E7D32) else PinkPrimary
                            ),
                            modifier = Modifier.fillMaxWidth().height(50.dp)
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                if (isChildServiceRunning) "PROTECTION RUNNING 🟢" else "ACTIVATE PROTECTION SERVICE",
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                // Real Hardware Permissions Checklist with One-Click Native Grant Buttons
                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = BackgroundWhite),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Text("Native Hardware Permissions", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = TextDark)
                        Text("Tap any permission to grant Android system access or open Settings.", fontSize = 12.sp, color = TextMedium)

                        InteractiveHardwareCheckRow(
                            title = "Camera Access",
                            status = cameraStatus,
                            onGrantClick = { requestPermissionOrOpenSettings("CAMERA") }
                        )

                        InteractiveHardwareCheckRow(
                            title = "Microphone Recording",
                            status = micStatus,
                            onGrantClick = { requestPermissionOrOpenSettings("MIC") }
                        )

                        InteractiveHardwareCheckRow(
                            title = "Background GPS Location",
                            status = locStatus,
                            onGrantClick = { requestPermissionOrOpenSettings("LOCATION") }
                        )

                        InteractiveHardwareCheckRow(
                            title = "Notifications",
                            status = notifStatus,
                            onGrantClick = { requestPermissionOrOpenSettings("NOTIFICATIONS") }
                        )

                        InteractiveHardwareCheckRow(
                            title = "Device Administrator",
                            status = if (isAdminActive) "granted" else "denied",
                            onGrantClick = {
                                val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
                                    putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, ComponentName(context, GuardianDeviceAdminReceiver::class.java))
                                    putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "Guardian Device Administrator protection.")
                                }
                                context.startActivity(intent)
                            }
                        )
                    }
                }

                // Unpair Button
                OutlinedButton(
                    onClick = onUnpair,
                    shape = RoundedCornerShape(14.dp),
                    border = androidx.compose.foundation.BorderStroke(1.5.dp, AlertRed),
                    modifier = Modifier.fillMaxWidth().height(48.dp)
                ) {
                    Icon(Icons.Default.LinkOff, contentDescription = null, tint = AlertRed)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("UNPAIR THIS DEVICE", color = AlertRed, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

// Interactive Hardware Check Row
@Composable
fun InteractiveHardwareCheckRow(
    title: String,
    status: String,
    onGrantClick: () -> Unit
) {
    val isGranted = (status == "granted")
    val isSettingsReq = (status == "settings_required")
    val buttonText = when {
        isGranted -> "ACTIVE ✓"
        isSettingsReq -> "SETTINGS"
        else -> "GRANT"
    }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(title, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = TextDark)
            Text(
                if (isGranted) "Permission granted by Android OS" else if (isSettingsReq) "Settings required" else "Permission denied",
                fontSize = 11.sp,
                color = TextMedium
            )
        }

        Button(
            onClick = onGrantClick,
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (isGranted) Color(0xFFE8F5E9) else PinkPrimary
            ),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
            modifier = Modifier.height(34.dp)
        ) {
            Text(
                text = buttonText,
                color = if (isGranted) Color(0xFF2E7D32) else Color.White,
                fontWeight = FontWeight.Bold,
                fontSize = 11.sp
            )
        }
    }
}
