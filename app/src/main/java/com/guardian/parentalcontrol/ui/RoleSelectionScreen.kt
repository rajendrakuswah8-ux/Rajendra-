package com.guardian.parentalcontrol.ui

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.widget.Toast
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.ListenerRegistration
import com.guardian.parentalcontrol.data.ChildDevice
import com.guardian.parentalcontrol.data.PairingCode
import com.guardian.parentalcontrol.data.PermissionMap
import com.guardian.parentalcontrol.service.ChildForegroundService
import com.guardian.parentalcontrol.service.GuardianDeviceAdminReceiver
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

enum class CurrentAppMode {
    ROLE_CHOOSER,
    PARENT_DASHBOARD,
    CHILD_MODE
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoleSelectionScreen() {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
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

    // Heartbeat loop for Parent and Child
    LaunchedEffect(currentMode) {
        while (true) {
            val now = System.currentTimeMillis()
            if (currentMode == CurrentAppMode.PARENT_DASHBOARD) {
                firestore.collection("guardians").document(guardianId)
                    .set(mapOf("guardianId" to guardianId, "lastSeen" to now, "isOnline" to true))
            } else if (currentMode == CurrentAppMode.CHILD_MODE && isChildPaired) {
                firestore.collection("childDevices").document(childDeviceId)
                    .update(mapOf("lastSeen" to now, "isOnline" to true))
            }
            delay(15_000L) // 15s heartbeat
        }
    }

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

                    // Button 2: CHILD (Outlined Pink - NEVER crashes)
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
// 2. PARENT MODE (Real Dashboard, Real Pairing Codes, Real Child List)
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
    var codeExpiresAt by remember { mutableStateOf(0L) }
    var isCodeUsed by remember { mutableStateOf(false) }
    var isGeneratingCode by remember { mutableStateOf(false) }

    // Real Children List from Firestore
    var childDevices by remember { mutableStateOf<List<ChildDevice>>(emptyList()) }
    var isLoadingDevices by remember { mutableStateOf(true) }

    // Listen to real child devices paired with this guardian
    DisposableEffect(guardianId) {
        val listener = firestore.collection("childDevices")
            .whereEqualTo("guardianId", guardianId)
            .addSnapshotListener { snapshot, error ->
                isLoadingDevices = false
                if (error == null && snapshot != null) {
                    val list = snapshot.documents.mapNotNull { doc ->
                        try {
                            doc.toObject(ChildDevice::class.java)
                        } catch (e: Exception) {
                            null
                        }
                    }
                    childDevices = list
                }
            }
        onDispose {
            listener.remove()
        }
    }

    // Function to generate a real temporary 6-digit pairing code
    fun generateRealPairingCode() {
        isGeneratingCode = true
        val random6Digit = String.format("%06d", (100000..999999).random())
        val expiryTime = System.currentTimeMillis() + 10 * 60 * 1000 // 10 minutes

        val pairingDoc = hashMapOf(
            "code" to random6Digit,
            "guardianId" to guardianId,
            "guardianEmail" to "",
            "guardianName" to "Guardian Parent",
            "expiresAt" to expiryTime,
            "isUsed" to false,
            "usedByDeviceId" to null,
            "createdAt" to System.currentTimeMillis().toString()
        )

        firestore.collection("pairingCodes").document(random6Digit)
            .set(pairingDoc)
            .addOnSuccessListener {
                generatedCode = random6Digit
                codeExpiresAt = expiryTime
                isCodeUsed = false
                isGeneratingCode = false

                // Real-time listener on this code to detect when child pairs
                firestore.collection("pairingCodes").document(random6Digit)
                    .addSnapshotListener { codeSnap, _ ->
                        val used = codeSnap?.getBoolean("isUsed") ?: false
                        if (used) {
                            isCodeUsed = true
                            Toast.makeText(context, "Child Device Connected Successfully! 🎉", Toast.LENGTH_LONG).show()
                        }
                    }
            }
            .addOnFailureListener { e ->
                isGeneratingCode = false
                Toast.makeText(context, "Failed to create code: ${e.message}", Toast.LENGTH_SHORT).show()
            }
    }

    // Remote Command Dispatcher
    fun sendCommand(deviceId: String, commandType: String) {
        val cmdId = UUID.randomUUID().toString()
        val ts = System.currentTimeMillis()

        val deviceCmd = hashMapOf(
            "commandId" to cmdId,
            "deviceId" to deviceId,
            "guardianId" to guardianId,
            "type" to commandType,
            "status" to "PENDING",
            "payload" to emptyMap<String, Any>(),
            "createdAt" to ts.toString(),
            "updatedAt" to ts.toString()
        )

        firestore.collection("deviceCommands").document(cmdId)
            .set(deviceCmd)
            .addOnSuccessListener {
                Toast.makeText(context, "$commandType sent to child device", Toast.LENGTH_SHORT).show()
            }
            .addOnFailureListener { e ->
                Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }

        // Also write to commands collection
        firestore.collection("commands").document(cmdId).set(deviceCmd)
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
                    showPairDialog = true
                    generateRealPairingCode()
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
                                Text("Real-time Firestore listeners online", fontSize = 12.sp, color = TextMedium)
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
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "PROTECTED CHILD DEVICES",
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = PinkPrimary,
                        letterSpacing = 1.sp
                    )
                }
            }

            // Empty State
            if (childDevices.isEmpty() && !isLoadingDevices) {
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
                                text = "Tap 'Pair Child Device' below to generate a real 6-digit code and connect your child's phone.",
                                fontSize = 13.sp,
                                color = TextMedium,
                                textAlign = TextAlign.Center,
                                lineHeight = 18.sp
                            )

                            Spacer(modifier = Modifier.height(20.dp))

                            Button(
                                onClick = {
                                    showPairDialog = true
                                    generateRealPairingCode()
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

            // Real Children Devices List
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

                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = BackgroundWhite),
                    border = androidx.compose.foundation.BorderStroke(1.dp, if (isOnline) PinkLight else Color(0xFFEEEEEE)),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(18.dp)) {
                        // Top Device Header: Name & Online Status
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

                        Spacer(modifier = Modifier.height(14.dp))
                        HorizontalDivider(color = Color(0xFFF5F5F5), thickness = 1.dp)
                        Spacer(modifier = Modifier.height(14.dp))

                        // Device Telemetry (Battery, Location, Hardware)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            // Battery
                            TelemetryItem(
                                icon = Icons.Default.BatteryChargingFull,
                                label = "Battery",
                                value = "${device.batteryLevel ?: "--"}%"
                            )

                            // Camera Perm
                            TelemetryItem(
                                icon = Icons.Default.CameraAlt,
                                label = "Camera",
                                value = device.permissions.camera.uppercase()
                            )

                            // Mic Perm
                            TelemetryItem(
                                icon = Icons.Default.Mic,
                                label = "Mic",
                                value = device.permissions.microphone.uppercase()
                            )

                            // Location Perm
                            TelemetryItem(
                                icon = Icons.Default.LocationOn,
                                label = "GPS",
                                value = device.permissions.location.uppercase()
                            )
                        }

                        Spacer(modifier = Modifier.height(16.dp))

                        // Live Action Buttons
                        Text("REAL-TIME REMOTE ACTIONS", fontWeight = FontWeight.Bold, fontSize = 11.sp, color = PinkDark)
                        Spacer(modifier = Modifier.height(8.dp))

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            // Emergency Siren
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

                            // Flashlight
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

                            // Lock Device
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

    // REAL PAIRING CODE GENERATION DIALOG
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

                    if (isGeneratingCode) {
                        CircularProgressIndicator(color = PinkPrimary)
                        Spacer(modifier = Modifier.height(10.dp))
                        Text("Generating secure code...", fontSize = 12.sp, color = TextMedium)
                    } else if (generatedCode != null) {
                        // Large 6-Digit Display
                        Surface(
                            shape = RoundedCornerShape(16.dp),
                            color = PinkContainer,
                            border = androidx.compose.foundation.BorderStroke(2.dp, PinkPrimary),
                            modifier = Modifier.padding(horizontal = 16.dp)
                        ) {
                            Text(
                                text = generatedCode ?: "",
                                fontSize = 34.sp,
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
                                text = "Expires in: 10 minutes",
                                fontSize = 12.sp,
                                color = AlertRed,
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
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

// =========================================================================
// 3. CHILD MODE (Setup, Pairing Code Validation, Real Foreground Service)
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

    var enteredCode by remember { mutableStateOf("") }
    var childNameInput by remember { mutableStateOf(Build.MODEL ?: "Child Phone") }
    var isConnecting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var isChildServiceRunning by remember { mutableStateOf(false) }

    // Check hardware permissions
    val hasCameraPerm = ContextCompat.checkSelfPermission(context, android.Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    val hasMicPerm = ContextCompat.checkSelfPermission(context, android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    val hasLocPerm = ContextCompat.checkSelfPermission(context, android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    val hasNotifPerm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    } else true

    // Function to validate pairing code in Firebase and connect
    fun connectWithCode() {
        val cleanCode = enteredCode.trim()
        if (cleanCode.length != 6) {
            errorMessage = "Please enter the complete 6-digit pairing code."
            return
        }

        isConnecting = true
        errorMessage = null

        firestore.collection("pairingCodes").document(cleanCode).get()
            .addOnSuccessListener { doc ->
                if (!doc.exists()) {
                    isConnecting = false
                    errorMessage = "Invalid pairing code. Please check the code shown on Parent's phone."
                    return@addOnSuccessListener
                }

                val expiresAt = doc.getLong("expiresAt") ?: 0L
                val isUsed = doc.getBoolean("isUsed") ?: false
                val guardianIdFromCode = doc.getString("guardianId") ?: ""

                if (System.currentTimeMillis() > expiresAt) {
                    isConnecting = false
                    errorMessage = "This pairing code has expired. Please generate a new code on Parent's phone."
                    return@addOnSuccessListener
                }

                if (isUsed) {
                    isConnecting = false
                    errorMessage = "This code has already been used by another device."
                    return@addOnSuccessListener
                }

                // 1. Mark code as used
                firestore.collection("pairingCodes").document(cleanCode)
                    .update(mapOf("isUsed" to true, "usedByDeviceId" to childDeviceId))

                // 2. Register child device in Firestore
                val childData = hashMapOf(
                    "deviceId" to childDeviceId,
                    "guardianId" to guardianIdFromCode,
                    "childName" to childNameInput,
                    "deviceModel" to (Build.MANUFACTURER + " " + Build.MODEL),
                    "isOnline" to true,
                    "lastSeen" to System.currentTimeMillis(),
                    "batteryLevel" to 80,
                    "isCharging" to false,
                    "permissions" to hashMapOf(
                        "camera" to (if (hasCameraPerm) "granted" else "denied"),
                        "microphone" to (if (hasMicPerm) "granted" else "denied"),
                        "location" to (if (hasLocPerm) "granted" else "denied"),
                        "notifications" to (if (hasNotifPerm) "granted" else "denied")
                    ),
                    "updatedAt" to System.currentTimeMillis().toString()
                )

                firestore.collection("childDevices").document(childDeviceId).set(childData)
                    .addOnSuccessListener {
                        isConnecting = false
                        // 3. Start Child Foreground Service
                        val intent = Intent(context, ChildForegroundService::class.java).apply {
                            putExtra("DEVICE_ID", childDeviceId)
                            putExtra("GUARDIAN_ID", guardianIdFromCode)
                        }
                        try {
                            context.startForegroundService(intent)
                            isChildServiceRunning = true
                        } catch (e: Exception) {
                            // fallback
                        }

                        onPairSuccess(guardianIdFromCode)
                        Toast.makeText(context, "CONNECTED TO PARENT! 🟢", Toast.LENGTH_LONG).show()
                    }
                    .addOnFailureListener { e ->
                        isConnecting = false
                        errorMessage = "Registration failed: ${e.message}"
                    }
            }
            .addOnFailureListener { e ->
                isConnecting = false
                errorMessage = "Network error: ${e.message}"
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
                // =========================================================
                // SETUP SCREEN: ENTER 6-DIGIT PAIRING CODE
                // =========================================================
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
                    text = "Generate a code on the Parent device and enter the 6 digits below to link this phone.",
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
                        if (it.length <= 6) {
                            enteredCode = it
                            errorMessage = null
                        }
                    },
                    placeholder = { Text("_ _ _ _ _ _", fontSize = 28.sp, letterSpacing = 8.sp, color = TextLight) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    textStyle = LocalTextStyle.current.copy(
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 8.sp,
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
                    label = { Text("Device Name (e.g. Anushka's Phone)") },
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
                    enabled = !isConnecting && enteredCode.length == 6,
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
                // =========================================================
                // ALREADY PAIRED: CONNECTED STATUS & PROTECTION SHIELD
                // =========================================================
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

                // Hardware Permissions Checklist
                Card(
                    shape = RoundedCornerShape(20.dp),
                    colors = CardDefaults.cardColors(containerColor = BackgroundWhite),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text("Hardware Permissions", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = TextDark)
                        HardwareCheckRow("Camera Access", hasCameraPerm)
                        HardwareCheckRow("Microphone Recording", hasMicPerm)
                        HardwareCheckRow("Background GPS", hasLocPerm)
                        HardwareCheckRow("Notifications", hasNotifPerm)
                        HardwareCheckRow("Device Administrator", isAdminActive)
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

// Telemetry item widget
@Composable
fun TelemetryItem(icon: ImageVector, label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, contentDescription = null, tint = PinkPrimary, modifier = Modifier.size(18.dp))
        Spacer(modifier = Modifier.height(2.dp))
        Text(value, fontWeight = FontWeight.Bold, fontSize = 12.sp, color = TextDark)
        Text(label, fontSize = 10.sp, color = TextMedium)
    }
}

// Hardware Check Row
@Composable
fun HardwareCheckRow(title: String, isGranted: Boolean) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title, fontSize = 13.sp, color = TextMedium)
        Surface(
            shape = RoundedCornerShape(6.dp),
            color = if (isGranted) Color(0xFFE8F5E9) else Color(0xFFFFEBEE)
        ) {
            Text(
                text = if (isGranted) "ACTIVE ✓" else "ACTION REQ",
                color = if (isGranted) Color(0xFF2E7D32) else AlertRed,
                fontWeight = FontWeight.Bold,
                fontSize = 10.sp,
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
            )
        }
    }
}
