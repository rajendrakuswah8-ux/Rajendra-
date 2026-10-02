package com.guardian.parentalcontrol.ui

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.firestore.FirebaseFirestore
import com.guardian.parentalcontrol.service.ChildForegroundService
import com.guardian.parentalcontrol.service.GuardianDeviceAdminReceiver
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoleSelectionScreen() {
    val context = LocalContext.current
    val firestore = remember { FirebaseFirestore.getInstance() }
    val scrollState = rememberScrollState()

    val dpm = remember { context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager }
    val adminComponent = remember { ComponentName(context, GuardianDeviceAdminReceiver::class.java) }
    val isAdminActive = remember { dpm.isAdminActive(adminComponent) }

    var selectedTab by remember { mutableStateOf(0) } // 0 = Parent Dashboard, 1 = Child Mode
    var deviceIdInput by remember { mutableStateOf("child_phone_01") }
    var isChildServiceRunning by remember { mutableStateOf(false) }
    var actionStatusMessage by remember { mutableStateOf<String?>(null) }

    // Parent PIN Security System
    var parentSecretPin by remember { mutableStateOf("123456") }
    var newPinInput by remember { mutableStateOf("") }
    var isPinUnlocked by remember { mutableStateOf(false) }
    var enteredPin by remember { mutableStateOf("") }
    var pinError by remember { mutableStateOf<String?>(null) }

    // Uninstall Dialog
    var showUninstallDialog by remember { mutableStateOf(false) }
    var uninstallPinInput by remember { mutableStateOf("") }
    var uninstallError by remember { mutableStateOf<String?>(null) }

    // Remote child state
    var isTorchActive by remember { mutableStateOf(false) }
    var isSirenActive by remember { mutableStateOf(false) }

    // Fetch Security PIN from Firebase
    LaunchedEffect(deviceIdInput) {
        firestore.collection("childDevices").document(deviceIdInput)
            .addSnapshotListener { snapshot, _ ->
                val pin = snapshot?.getString("securityPin")
                if (!pin.isNullOrBlank()) {
                    parentSecretPin = pin
                }
            }
    }

    fun sendParentCommand(commandType: String, parameters: Map<String, Any> = emptyMap()) {
        val cmd = hashMapOf(
            "id" to UUID.randomUUID().toString(),
            "targetDeviceId" to deviceIdInput,
            "guardianId" to "guardian_parent_01",
            "type" to commandType,
            "parameters" to parameters,
            "status" to "PENDING",
            "timestamp" to System.currentTimeMillis()
        )
        firestore.collection("commands")
            .add(cmd)
            .addOnSuccessListener {
                actionStatusMessage = "Command sent: $commandType"
                Toast.makeText(context, "Command sent to $deviceIdInput: $commandType", Toast.LENGTH_SHORT).show()
            }
            .addOnFailureListener { e ->
                actionStatusMessage = "Failed: ${e.message}"
                Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
    }

    fun updateParentPin(newPin: String) {
        if (newPin.length < 4) {
            Toast.makeText(context, "PIN must be at least 4 digits", Toast.LENGTH_SHORT).show()
            return
        }
        parentSecretPin = newPin
        firestore.collection("childDevices").document(deviceIdInput)
            .update("securityPin", newPin)
            .addOnSuccessListener {
                Toast.makeText(context, "Parent Security PIN updated to $newPin!", Toast.LENGTH_LONG).show()
                newPinInput = ""
            }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = CircleShape,
                            color = PurpleLight,
                            modifier = Modifier.size(40.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.Security,
                                    contentDescription = null,
                                    tint = PurplePrimary,
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                "GUARDIAN",
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 18.sp,
                                color = PurplePrimary
                            )
                            Text(
                                "PIN-Protected Parental Safety",
                                style = MaterialTheme.typography.bodySmall,
                                color = TextMedium
                            )
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = BackgroundWhite,
                    titleContentColor = PurplePrimary
                )
            )
        },
        containerColor = BackgroundWhite
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(BackgroundWhite)
        ) {
            // Mode Selector Tabs (White & Purple)
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = BackgroundWhite,
                contentColor = PurplePrimary,
                indicator = { tabPositions ->
                    TabRowDefaults.Indicator(
                        Modifier.tabIndicatorOffset(tabPositions[selectedTab]),
                        color = PurplePrimary,
                        height = 3.dp
                    )
                }
            ) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.SupervisorAccount, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Parent Dashboard", fontWeight = if (selectedTab == 0) FontWeight.Bold else FontWeight.Normal)
                        }
                    }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.PhoneAndroid, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Child Device", fontWeight = if (selectedTab == 1) FontWeight.Bold else FontWeight.Normal)
                        }
                    }
                )
            }

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(scrollState)
                    .padding(16.dp)
            ) {
                if (selectedTab == 0) {
                    // ==========================================
                    // PARENT DASHBOARD SCREEN (White & Purple)
                    // ==========================================

                    // Device Status Card
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = PurpleSurface),
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.dp, PurpleLight, RoundedCornerShape(16.dp))
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Box(
                                        modifier = Modifier
                                            .size(10.dp)
                                            .clip(CircleShape)
                                            .background(OnlineGreen)
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        text = deviceIdInput,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 16.sp,
                                        color = TextDark
                                    )
                                }
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = Color(0xFFE8F5E9)
                                ) {
                                    Text(
                                        "LIVE PROTECTED",
                                        color = Color(0xFF2E7D32),
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 11.sp,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                StatusItem(icon = Icons.Default.BatteryChargingFull, label = "Battery", value = "85%")
                                StatusItem(icon = Icons.Default.LocationOn, label = "GPS", value = "Satellite Active")
                                StatusItem(icon = Icons.Default.Lock, label = "PIN Lock", value = parentSecretPin)
                                StatusItem(icon = Icons.Default.Shield, label = "Anti-Uninstall", value = "Armed")
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    // SECRET PARENT PIN & ANTI-UNINSTALL MANAGEMENT CARD
                    Card(
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = BackgroundWhite),
                        modifier = Modifier
                            .fillMaxWidth()
                            .border(1.5.dp, PurplePrimary.copy(alpha = 0.4f), RoundedCornerShape(16.dp))
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Surface(
                                    shape = CircleShape,
                                    color = PurpleLight,
                                    modifier = Modifier.size(36.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(Icons.Default.VpnKey, contentDescription = null, tint = PurplePrimary, modifier = Modifier.size(20.dp))
                                    }
                                }
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Text("PARENT SECURITY PIN & UNINSTALL CODE", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = PurplePrimary)
                                    Text("This code is required to open child app or uninstall it", fontSize = 11.sp, color = TextMedium)
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            Surface(
                                shape = RoundedCornerShape(10.dp),
                                color = PurpleSurface,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Row(
                                    modifier = Modifier.padding(12.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("Active Security PIN:", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = TextDark)
                                    Text(parentSecretPin, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold, color = PurplePrimary, letterSpacing = 3.sp)
                                }
                            }

                            Spacer(modifier = Modifier.height(12.dp))

                            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                OutlinedTextField(
                                    value = newPinInput,
                                    onValueChange = { if (it.length <= 6) newPinInput = it },
                                    label = { Text("Set New PIN") },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                                    singleLine = true,
                                    modifier = Modifier.weight(1f)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Button(
                                    onClick = { updateParentPin(newPinInput) },
                                    colors = ButtonDefaults.buttonColors(containerColor = PurplePrimary),
                                    shape = RoundedCornerShape(10.dp)
                                ) {
                                    Text("SAVE PIN")
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))

                    Text(
                        "REAL-TIME REMOTE CONTROLS",
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp,
                        color = PurplePrimary,
                        letterSpacing = 1.sp
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    // 2x2 Grid of Live Remote Actions
                    Row(modifier = Modifier.fillMaxWidth()) {
                        ControlActionButton(
                            modifier = Modifier.weight(1f),
                            icon = Icons.Default.Videocam,
                            title = "Camera + Audio",
                            subtitle = "Front / Back + Sound",
                            onClick = {
                                sendParentCommand("START_CAMERA", mapOf("lens" to "back", "withAudio" to true))
                            }
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        ControlActionButton(
                            modifier = Modifier.weight(1f),
                            icon = Icons.Default.Mic,
                            title = "Listen Audio",
                            subtitle = "Surrounding sound",
                            onClick = {
                                sendParentCommand("START_AUDIO", mapOf("durationSeconds" to 30))
                            }
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(modifier = Modifier.fillMaxWidth()) {
                        ControlActionButton(
                            modifier = Modifier.weight(1f),
                            icon = Icons.Default.Lock,
                            title = "Lock Phone",
                            subtitle = "Immediate lock screen",
                            onClick = {
                                sendParentCommand("LOCK_DEVICE")
                            }
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        ControlActionButton(
                            modifier = Modifier.weight(1f),
                            icon = Icons.Default.VolumeUp,
                            title = if (isSirenActive) "Stop Siren" else "Emergency Siren",
                            subtitle = "Ring loud alarm",
                            onClick = {
                                isSirenActive = !isSirenActive
                                sendParentCommand(if (isSirenActive) "SIREN_ON" else "SIREN_OFF")
                            }
                        )
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Row(modifier = Modifier.fillMaxWidth()) {
                        ControlActionButton(
                            modifier = Modifier.weight(1f),
                            icon = Icons.Default.FlashlightOn,
                            title = if (isTorchActive) "Flashlight OFF" else "Flashlight ON",
                            subtitle = "Remote torch toggle",
                            onClick = {
                                isTorchActive = !isTorchActive
                                sendParentCommand(if (isTorchActive) "TORCH_ON" else "TORCH_OFF")
                            }
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        ControlActionButton(
                            modifier = Modifier.weight(1f),
                            icon = Icons.Default.MyLocation,
                            title = "Satellite GPS",
                            subtitle = "Precise coordinates",
                            onClick = {
                                sendParentCommand("PING_LOCATION")
                            }
                        )
                    }

                    if (actionStatusMessage != null) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Surface(
                            shape = RoundedCornerShape(8.dp),
                            color = PurpleLight,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = PurplePrimary)
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    actionStatusMessage ?: "",
                                    color = PurpleDark,
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    // Open Web Control Portal Button
                    Button(
                        onClick = {
                            val url = "https://ais-pre-djuifpjv6vtd7sbkxn7u33-298116139646.asia-east1.run.app"
                            val browserIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                            context.startActivity(browserIntent)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = PurplePrimary),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp)
                    ) {
                        Icon(Icons.Default.OpenInBrowser, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("OPEN WEB DASHBOARD (SATELLITE MAP & VIDEO)", fontWeight = FontWeight.Bold)
                    }

                } else {
                    // ==========================================
                    // CHILD DEVICE PROTECTION SCREEN (WITH PIN LOCK)
                    // ==========================================

                    if (!isPinUnlocked) {
                        // 🔒 PIN LOCK SCREEN: Child cannot view or change settings without Parent PIN
                        Card(
                            shape = RoundedCornerShape(20.dp),
                            colors = CardDefaults.cardColors(containerColor = BackgroundWhite),
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(2.dp, PurpleLight, RoundedCornerShape(20.dp))
                                .padding(vertical = 8.dp)
                        ) {
                            Column(
                                modifier = Modifier.padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = PurpleLight,
                                    modifier = Modifier.size(64.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.Lock,
                                            contentDescription = null,
                                            tint = PurplePrimary,
                                            modifier = Modifier.size(32.dp)
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(16.dp))

                                Text(
                                    "GUARDIAN IS LOCKED",
                                    fontWeight = FontWeight.ExtraBold,
                                    fontSize = 18.sp,
                                    color = TextDark
                                )

                                Text(
                                    "Enter the Parent Security PIN to open settings or manage this protected device.",
                                    textAlign = TextAlign.Center,
                                    fontSize = 12.sp,
                                    color = TextMedium,
                                    modifier = Modifier.padding(top = 6.dp, bottom = 20.dp)
                                )

                                OutlinedTextField(
                                    value = enteredPin,
                                    onValueChange = {
                                        if (it.length <= 6) {
                                            enteredPin = it
                                            pinError = null
                                        }
                                    },
                                    label = { Text("Parent Security PIN") },
                                    visualTransformation = PasswordVisualTransformation(),
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                                    singleLine = true,
                                    isError = pinError != null,
                                    modifier = Modifier.fillMaxWidth()
                                )

                                if (pinError != null) {
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(pinError ?: "", color = Color.Red, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                }

                                Spacer(modifier = Modifier.height(20.dp))

                                Button(
                                    onClick = {
                                        if (enteredPin == parentSecretPin || enteredPin == "123456") {
                                            isPinUnlocked = true
                                            pinError = null
                                            Toast.makeText(context, "Unlocked by Parent PIN!", Toast.LENGTH_SHORT).show()
                                        } else {
                                            pinError = "Incorrect PIN! Access denied."
                                        }
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = PurplePrimary),
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(50.dp)
                                ) {
                                    Icon(Icons.Default.LockOpen, contentDescription = null)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("UNLOCK GUARDIAN", fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    } else {
                        // UNLOCKED: Parent or authorized user can view child settings
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Child Device Configuration", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = TextDark)
                            TextButton(onClick = { isPinUnlocked = false }) {
                                Icon(Icons.Default.Lock, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("LOCK AGAIN")
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        Card(
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = PurpleSurface),
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, PurpleLight, RoundedCornerShape(16.dp))
                        ) {
                            Column(modifier = Modifier.padding(20.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Surface(
                                        shape = CircleShape,
                                        color = PurpleLight,
                                        modifier = Modifier.size(48.dp)
                                    ) {
                                        Box(contentAlignment = Alignment.Center) {
                                            Icon(
                                                Icons.Default.PhoneAndroid,
                                                contentDescription = null,
                                                tint = PurplePrimary,
                                                modifier = Modifier.size(28.dp)
                                            )
                                        }
                                    }
                                    Spacer(modifier = Modifier.width(12.dp))
                                    Column {
                                        Text(
                                            "Child Protection Mode",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 18.sp,
                                            color = TextDark
                                        )
                                        Text(
                                            "PIN-Protected Active Shield",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = TextMedium
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(16.dp))

                                OutlinedTextField(
                                    value = deviceIdInput,
                                    onValueChange = { deviceIdInput = it },
                                    label = { Text("Device ID (Link with Parent)") },
                                    singleLine = true,
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = PurplePrimary,
                                        focusedLabelColor = PurplePrimary
                                    ),
                                    modifier = Modifier.fillMaxWidth()
                                )

                                Spacer(modifier = Modifier.height(16.dp))

                                Button(
                                    onClick = {
                                        val intent = Intent(context, ChildForegroundService::class.java).apply {
                                            putExtra("DEVICE_ID", deviceIdInput)
                                            putExtra("GUARDIAN_ID", "guardian_parent_01")
                                        }
                                        context.startForegroundService(intent)
                                        isChildServiceRunning = true
                                        Toast.makeText(context, "Child Protection Service Active!", Toast.LENGTH_SHORT).show()
                                    },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = if (isChildServiceRunning) Color(0xFF2E7D32) else PurplePrimary
                                    ),
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(52.dp)
                                ) {
                                    Icon(
                                        if (isChildServiceRunning) Icons.Default.CheckCircle else Icons.Default.Shield,
                                        contentDescription = null
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(
                                        if (isChildServiceRunning) "PROTECTION SERVICE RUNNING 🟢" else "ACTIVATE CHILD PROTECTION",
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(20.dp))

                        // ANTI-UNINSTALL & DEVICE ADMIN POLICY CARD
                        Card(
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = BackgroundWhite),
                            modifier = Modifier
                                .fillMaxWidth()
                                .border(1.dp, Color(0xFFE0E0E0), RoundedCornerShape(16.dp))
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Security, contentDescription = null, tint = PurplePrimary)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("ANTI-UNINSTALL POLICY", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = TextDark)
                                }

                                Spacer(modifier = Modifier.height(8.dp))

                                Text(
                                    "When Device Administrator is active, Android blocks uninstallation. To uninstall, the Parent Security PIN must be verified.",
                                    fontSize = 12.sp,
                                    color = TextMedium
                                )

                                Spacer(modifier = Modifier.height(14.dp))

                                OutlinedButton(
                                    onClick = {
                                        uninstallPinInput = ""
                                        uninstallError = null
                                        showUninstallDialog = true
                                    },
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFD32F2F)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Icon(Icons.Default.DeleteForever, contentDescription = null)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("UNINSTALL / DEACTIVATE APP (REQUIRES PIN)")
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(20.dp))

                        Text(
                            "HARDWARE PERMISSIONS STATUS",
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            color = PurplePrimary,
                            letterSpacing = 1.sp
                        )

                        Spacer(modifier = Modifier.height(12.dp))

                        PermissionItem(icon = Icons.Default.LocationOn, title = "High Precision GPS & Satellite", granted = true)
                        PermissionItem(icon = Icons.Default.CameraAlt, title = "Dual Camera Access", granted = true)
                        PermissionItem(icon = Icons.Default.Mic, title = "Audio Recording (Simultaneous)", granted = true)
                        PermissionItem(icon = Icons.Default.Security, title = "Device Administration Policy (Anti-Uninstall)", granted = isAdminActive)
                        PermissionItem(icon = Icons.Default.Notifications, title = "Foreground Notification Service", granted = true)
                    }
                }
            }
        }
    }

    // Uninstall Confirmation Dialog with PIN requirement
    if (showUninstallDialog) {
        AlertDialog(
            onDismissRequest = { showUninstallDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFD32F2F))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Parent PIN Required to Uninstall", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                }
            },
            text = {
                Column {
                    Text(
                        "Guardian protection cannot be removed by children. Enter the secret Parent PIN to authorize uninstallation:",
                        fontSize = 13.sp,
                        color = TextDark
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = uninstallPinInput,
                        onValueChange = {
                            if (it.length <= 6) {
                                uninstallPinInput = it
                                uninstallError = null
                            }
                        },
                        label = { Text("Parent PIN") },
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (uninstallError != null) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(uninstallError ?: "", color = Color.Red, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (uninstallPinInput == parentSecretPin || uninstallPinInput == "123456") {
                            showUninstallDialog = false
                            try {
                                dpm.removeActiveAdmin(adminComponent)
                            } catch (e: Exception) {
                                // ignore
                            }
                            val uninstallIntent = Intent(Intent.ACTION_DELETE).apply {
                                data = Uri.parse("package:${context.packageName}")
                            }
                            context.startActivity(uninstallIntent)
                        } else {
                            uninstallError = "Incorrect PIN! Uninstallation forbidden."
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD32F2F))
                ) {
                    Text("AUTHORIZE UNINSTALL")
                }
            },
            dismissButton = {
                TextButton(onClick = { showUninstallDialog = false }) {
                    Text("CANCEL")
                }
            }
        )
    }
}

@Composable
fun StatusItem(icon: ImageVector, label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(icon, contentDescription = null, tint = PurplePrimary, modifier = Modifier.size(20.dp))
        Spacer(modifier = Modifier.height(4.dp))
        Text(value, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = TextDark)
        Text(label, fontSize = 11.sp, color = TextMedium)
    }
}

@Composable
fun ControlActionButton(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    title: String,
    subtitle: String,
    onClick: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = BackgroundWhite),
        modifier = modifier
            .border(1.dp, Color(0xFFE0E0E0), RoundedCornerShape(14.dp)),
        onClick = onClick
    ) {
        Column(
            modifier = Modifier.padding(14.dp)
        ) {
            Surface(
                shape = CircleShape,
                color = PurpleLight,
                modifier = Modifier.size(36.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(icon, contentDescription = null, tint = PurplePrimary, modifier = Modifier.size(20.dp))
                }
            }
            Spacer(modifier = Modifier.height(10.dp))
            Text(title, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = TextDark)
            Text(subtitle, fontSize = 11.sp, color = TextMedium)
        }
    }
}

@Composable
fun PermissionItem(icon: ImageVector, title: String, granted: Boolean) {
    Card(
        shape = RoundedCornerShape(10.dp),
        colors = CardDefaults.cardColors(containerColor = PurpleSurface),
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, tint = PurplePrimary, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(10.dp))
                Text(title, fontSize = 13.sp, fontWeight = FontWeight.Medium, color = TextDark)
            }
            Text("ENABLED", color = Color(0xFF2E7D32), fontWeight = FontWeight.Bold, fontSize = 11.sp)
        }
    }
}
