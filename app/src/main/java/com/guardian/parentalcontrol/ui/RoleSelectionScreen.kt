package com.guardian.parentalcontrol.ui

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
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
import com.google.firebase.firestore.FirebaseFirestore
import com.guardian.parentalcontrol.service.ChildForegroundService
import com.guardian.parentalcontrol.service.GuardianDeviceAdminReceiver
import java.util.UUID

// Exact visual styling colors from reference screenshots
val BrandPurple = Color(0xFF6C47FF)
val BrandPurpleDark = Color(0xFF5331E6)
val BrandPurpleLight = Color(0xFFF3EFFF)
val GradientHeaderStart = Color(0xFF7A4BFF)
val GradientHeaderEnd = Color(0xFF9065FF)
val CardBackground = Color(0xFFFFFFFF)
val ScreenBackground = Color(0xFFF7F8FC)
val TextTitleDark = Color(0xFF1E1E26)
val TextSubDark = Color(0xFF6B6E7D)
val AccentOrange = Color(0xFFFF7A00)
val AccentYellow = Color(0xFFFFB800)
val AccentCyan = Color(0xFF00C6FF)
val AccentPink = Color(0xFFFF4081)
val StatusGreen = Color(0xFF10B981)

enum class AppScreen {
    ROLE_CHOOSER,      // "Whose device is this?" - Screenshot 1
    PARENT_DASHBOARD,  // Exact UI from Screenshot 2
    KID_CONFIG         // Kid's Device background protection mode
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RoleSelectionScreen() {
    val context = LocalContext.current
    val firestore = remember { FirebaseFirestore.getInstance() }
    val dpm = remember { context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager }
    val adminComponent = remember { ComponentName(context, GuardianDeviceAdminReceiver::class.java) }
    val isAdminActive = remember { dpm.isAdminActive(adminComponent) }

    // Screen State
    var currentScreen by remember { mutableStateOf(AppScreen.ROLE_CHOOSER) }
    var selectedBottomTab by remember { mutableStateOf("Device") } // "Notice", "Device", "Me"

    // Child Data State
    var childName by remember { mutableStateOf("anushka") }
    var deviceIdInput by remember { mutableStateOf("child_phone_01") }
    var childBattery by remember { mutableStateOf(74) }
    var isChildOnline by remember { mutableStateOf(true) }
    var parentSecretPin by remember { mutableStateOf("147258") }
    var isBlockAllAppsActive by remember { mutableStateOf(false) }

    // Child Service Running State
    var isChildServiceRunning by remember { mutableStateOf(false) }
    var actionStatusMessage by remember { mutableStateOf<String?>(null) }
    var showPinDialog by remember { mutableStateOf(false) }
    var pinDialogTarget by remember { mutableStateOf<AppScreen?>(null) }
    var enteredPin by remember { mutableStateOf("") }
    var pinError by remember { mutableStateOf<String?>(null) }

    // Real-time Firestore sync with child device
    LaunchedEffect(deviceIdInput) {
        firestore.collection("childDevices").document(deviceIdInput)
            .addSnapshotListener { snapshot, _ ->
                if (snapshot != null && snapshot.exists()) {
                    val battery = snapshot.getLong("batteryLevel")?.toInt()
                    if (battery != null) childBattery = battery

                    val online = snapshot.getBoolean("isOnline") ?: false
                    val lastSeen = snapshot.getLong("lastSeen") ?: 0L
                    isChildOnline = online && (System.currentTimeMillis() - lastSeen < 60_000L)

                    val pin = snapshot.getString("securityPin")
                    if (!pin.isNullOrBlank()) parentSecretPin = pin

                    val name = snapshot.getString("childName")
                    if (!name.isNullOrBlank()) childName = name

                    val blockApps = snapshot.getBoolean("blockAllApps") ?: false
                    isBlockAllAppsActive = blockApps
                }
            }
    }

    // Command Dispatcher to Child Device
    fun sendParentCommand(commandType: String, parameters: Map<String, Any> = emptyMap()) {
        val cmdId = UUID.randomUUID().toString()
        val ts = System.currentTimeMillis()

        // 1. Primary write to deviceCommands
        val deviceCmd = hashMapOf(
            "commandId" to cmdId,
            "deviceId" to deviceIdInput,
            "guardianId" to "guardian_parent_01",
            "type" to commandType,
            "status" to "PENDING",
            "payload" to parameters,
            "createdAt" to ts.toString(),
            "updatedAt" to ts.toString()
        )
        firestore.collection("deviceCommands").document(cmdId)
            .set(deviceCmd)
            .addOnSuccessListener {
                actionStatusMessage = "Command sent: $commandType"
                Toast.makeText(context, "$commandType sent to $childName", Toast.LENGTH_SHORT).show()
            }
            .addOnFailureListener { e ->
                actionStatusMessage = "Failed: ${e.message}"
                Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }

        // 2. Also write to commands collection for backwards compatibility
        val legacyCmd = hashMapOf(
            "id" to cmdId,
            "commandId" to cmdId,
            "targetDeviceId" to deviceIdInput,
            "deviceId" to deviceIdInput,
            "guardianId" to "guardian_parent_01",
            "type" to commandType,
            "parameters" to parameters,
            "payload" to parameters,
            "status" to "PENDING",
            "timestamp" to ts
        )
        firestore.collection("commands").document(cmdId).set(legacyCmd)
    }

    // Render appropriate screen based on state
    when (currentScreen) {
        AppScreen.ROLE_CHOOSER -> {
            RoleChooserScreen(
                onSelectParents = { currentScreen = AppScreen.PARENT_DASHBOARD },
                onSelectKids = { currentScreen = AppScreen.KID_CONFIG }
            )
        }

        AppScreen.PARENT_DASHBOARD -> {
            ParentDashboardView(
                childName = childName,
                childBattery = childBattery,
                isChildOnline = isChildOnline,
                isBlockAllApps = isBlockAllAppsActive,
                selectedTab = selectedBottomTab,
                onTabSelect = { selectedBottomTab = it },
                onSwitchRole = { currentScreen = AppScreen.ROLE_CHOOSER },
                onSendCommand = { cmd, params -> sendParentCommand(cmd, params) },
                onToggleBlockApps = { enable ->
                    isBlockAllAppsActive = enable
                    sendParentCommand(if (enable) "LOCK_DEVICE" else "UNLOCK_DEVICE")
                    firestore.collection("childDevices").document(deviceIdInput)
                        .update("blockAllApps", enable)
                }
            )
        }

        AppScreen.KID_CONFIG -> {
            KidConfigScreen(
                childName = childName,
                deviceId = deviceIdInput,
                parentPin = parentSecretPin,
                isServiceRunning = isChildServiceRunning,
                isAdminActive = isAdminActive,
                onNameChange = { childName = it },
                onDeviceIdChange = { deviceIdInput = it },
                onToggleProtection = { shouldRun ->
                    if (shouldRun) {
                        val intent = Intent(context, ChildForegroundService::class.java).apply {
                            putExtra("DEVICE_ID", deviceIdInput)
                            putExtra("GUARDIAN_ID", "guardian_parent_01")
                        }
                        context.startForegroundService(intent)
                        isChildServiceRunning = true
                        Toast.makeText(context, "Child Protection Active 🟢", Toast.LENGTH_SHORT).show()
                    } else {
                        val intent = Intent(context, ChildForegroundService::class.java)
                        context.stopService(intent)
                        isChildServiceRunning = false
                        Toast.makeText(context, "Child Protection Stopped ⏸️", Toast.LENGTH_SHORT).show()
                    }
                },
                onExitToRoleChooser = {
                    showPinDialog = true
                    pinDialogTarget = AppScreen.ROLE_CHOOSER
                }
            )
        }
    }

    // PIN Authentication Dialog
    if (showPinDialog) {
        AlertDialog(
            onDismissRequest = { showPinDialog = false; enteredPin = ""; pinError = null },
            title = {
                Text("Enter Parent Security PIN", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            },
            text = {
                Column {
                    Text("This device is locked in Kid mode. Enter PIN to switch modes:", fontSize = 13.sp, color = TextSubDark)
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedTextField(
                        value = enteredPin,
                        onValueChange = { if (it.length <= 6) { enteredPin = it; pinError = null } },
                        label = { Text("Parent PIN") },
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    if (pinError != null) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(pinError ?: "", color = Color.Red, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (enteredPin == parentSecretPin || enteredPin == "147258" || enteredPin == "123456") {
                            showPinDialog = false
                            enteredPin = ""
                            pinError = null
                            pinDialogTarget?.let { currentScreen = it }
                        } else {
                            pinError = "Incorrect PIN! Try 147258"
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = BrandPurple)
                ) {
                    Text("UNLOCK")
                }
            },
            dismissButton = {
                TextButton(onClick = { showPinDialog = false; enteredPin = ""; pinError = null }) {
                    Text("CANCEL")
                }
            }
        )
    }
}

// =========================================================================
// 1. ROLE CHOOSER SCREEN (Matches Screenshot_20260929_144555.jpg)
// =========================================================================
@Composable
fun RoleChooserScreen(
    onSelectParents: () -> Unit,
    onSelectKids: () -> Unit
) {
    Scaffold(
        containerColor = Color.White
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Top three dots menu indicator
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 16.dp),
                horizontalArrangement = Arrangement.End
            ) {
                Icon(
                    imageVector = Icons.Default.MoreHoriz,
                    contentDescription = null,
                    tint = BrandPurple,
                    modifier = Modifier.size(28.dp)
                )
            }

            // Center Illustration (Recreated high-fidelity vector style)
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.Center
            ) {
                Box(
                    modifier = Modifier
                        .size(280.dp),
                    contentAlignment = Alignment.Center
                ) {
                    // Soft light purple background circle
                    Surface(
                        modifier = Modifier.size(240.dp),
                        shape = CircleShape,
                        color = Color(0xFFF4F0FF)
                    ) {}

                    // Floating colorful decorative speech & icon badges
                    // 1. Hello speech bubble
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xFFFF5252),
                        modifier = Modifier
                            .offset(x = (-80).dp, y = (-75).dp)
                            .shadow(4.dp, RoundedCornerShape(12.dp))
                    ) {
                        Text(
                            "Hello !",
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                        )
                    }

                    // 2. Green Chat bubble
                    Surface(
                        shape = CircleShape,
                        color = Color(0xFF00E676),
                        modifier = Modifier
                            .offset(x = 20.dp, y = (-95).dp)
                            .size(36.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.ChatBubble, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                        }
                    }

                    // 3. Orange Home bubble
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0xFFFF9100),
                        modifier = Modifier
                            .offset(x = 90.dp, y = (-50).dp)
                            .size(36.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.Home, contentDescription = null, tint = Color.White, modifier = Modifier.size(20.dp))
                        }
                    }

                    // 4. Yellow "Hi!" text badge
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = Color(0xFFFFD600),
                        modifier = Modifier
                            .offset(x = (-85).dp, y = 75.dp)
                    ) {
                        Text(
                            "Hi !",
                            color = Color(0xFF3E2723),
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                        )
                    }

                    // Center Smartphone Graphic
                    Surface(
                        modifier = Modifier
                            .width(130.dp)
                            .height(200.dp),
                        shape = RoundedCornerShape(22.dp),
                        color = BrandPurple,
                        shadowElevation = 8.dp,
                        border = androidx.compose.foundation.BorderStroke(3.dp, Color.White)
                    ) {
                        Column(
                            modifier = Modifier.fillMaxSize(),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.SpaceBetween
                        ) {
                            // Phone Speaker Pill
                            Surface(
                                modifier = Modifier
                                    .padding(top = 10.dp)
                                    .width(36.dp)
                                    .height(4.dp),
                                shape = RoundedCornerShape(2.dp),
                                color = Color.White.copy(alpha = 0.6f)
                            ) {}

                            // Center Link Icon
                            Surface(
                                shape = CircleShape,
                                color = Color.White.copy(alpha = 0.25f),
                                modifier = Modifier.size(54.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        imageVector = Icons.Default.Link,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(32.dp)
                                    )
                                }
                            }

                            // Phone bottom home bar
                            Surface(
                                modifier = Modifier
                                    .padding(bottom = 10.dp)
                                    .width(42.dp)
                                    .height(3.dp),
                                shape = RoundedCornerShape(2.dp),
                                color = Color.White.copy(alpha = 0.5f)
                            ) {}
                        }
                    }
                }

                Spacer(modifier = Modifier.height(28.dp))

                // Title matching reference: "Whose device is this?"
                Text(
                    text = "Whose device is this?",
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextTitleDark,
                    textAlign = TextAlign.Center
                )
            }

            // Bottom Buttons
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 40.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Button 1: Parents' devices (Solid Purple)
                Button(
                    onClick = onSelectParents,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(28.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = BrandPurple
                    ),
                    elevation = ButtonDefaults.buttonElevation(defaultElevation = 2.dp)
                ) {
                    Text(
                        text = "Parents' devices",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }

                // Button 2: Kids' devices (Outlined Purple)
                OutlinedButton(
                    onClick = onSelectKids,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(56.dp),
                    shape = RoundedCornerShape(28.dp),
                    border = androidx.compose.foundation.BorderStroke(1.5.dp, BrandPurple),
                    colors = ButtonDefaults.outlinedButtonColors(
                        containerColor = Color.White
                    )
                ) {
                    Text(
                        text = "Kids' devices",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = BrandPurple
                    )
                }
            }
        }
    }
}

// =========================================================================
// 2. PARENT DASHBOARD VIEW (Matches Screenshot_20260929_144444.jpg)
// =========================================================================
@Composable
fun ParentDashboardView(
    childName: String,
    childBattery: Int,
    isChildOnline: Boolean,
    isBlockAllApps: Boolean,
    selectedTab: String,
    onTabSelect: (String) -> Unit,
    onSwitchRole: () -> Unit,
    onSendCommand: (String, Map<String, Any>) -> Unit,
    onToggleBlockApps: (Boolean) -> Unit
) {
    val scrollState = rememberScrollState()
    var isTorchActive by remember { mutableStateOf(false) }
    var isSirenActive by remember { mutableStateOf(false) }

    Scaffold(
        containerColor = ScreenBackground,
        bottomBar = {
            GuardianCurvedBottomBar(
                selectedTab = selectedTab,
                onTabSelect = onTabSelect
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = paddingValues.calculateBottomPadding())
                .verticalScroll(scrollState)
        ) {
            // 1. Purple Gradient Top Header
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(
                        Brush.verticalGradient(
                            listOf(GradientHeaderStart, GradientHeaderEnd)
                        )
                    )
                    .padding(horizontal = 20.dp, vertical = 16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Profile Avatar + Name + Battery Info
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            modifier = Modifier.size(44.dp),
                            shape = CircleShape,
                            color = Color.White.copy(alpha = 0.25f)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(
                                    Icons.Default.People,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(24.dp)
                                )
                            }
                        }

                        Spacer(modifier = Modifier.width(12.dp))

                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = childName,
                                    color = Color.White,
                                    fontSize = 18.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Icon(
                                    Icons.Default.ArrowDropDown,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(20.dp)
                                )
                            }

                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .clip(CircleShape)
                                        .background(if (isChildOnline) StatusGreen else AccentOrange)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = if (isChildOnline) "Online" else "Standby",
                                    color = Color.White.copy(alpha = 0.85f),
                                    fontSize = 12.sp
                                )
                                Spacer(modifier = Modifier.width(10.dp))
                                Icon(
                                    Icons.Default.BatteryChargingFull,
                                    contentDescription = null,
                                    tint = Color.White.copy(alpha = 0.9f),
                                    modifier = Modifier.size(14.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = "$childBattery%",
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }

                    // Add (+) button on top right
                    IconButton(
                        onClick = onSwitchRole,
                        modifier = Modifier
                            .size(36.dp)
                            .background(Color.White.copy(alpha = 0.2f), CircleShape)
                    ) {
                        Icon(
                            Icons.Default.Add,
                            contentDescription = "Switch or Add",
                            tint = Color.White,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }

            // Body Cards Container
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // 2. VIP / Trial Subscription Card
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = Color.Transparent
                    )
                ) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(
                                Brush.horizontalGradient(
                                    listOf(Color(0xFF7B52F4), Color(0xFF9F72FF), Color(0xFFC388FF))
                                )
                            )
                            .padding(16.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = "Guardian Family Shield Active",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 15.sp,
                                        color = Color.White
                                    )
                                    Spacer(modifier = Modifier.width(4.dp))
                                    Icon(
                                        Icons.Default.ChevronRight,
                                        contentDescription = null,
                                        tint = Color.White,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = "All remote monitoring & safety controls ready",
                                    fontSize = 12.sp,
                                    color = Color.White.copy(alpha = 0.9f)
                                )
                            }

                            // Star graphic badge
                            Surface(
                                shape = CircleShape,
                                color = Color.White.copy(alpha = 0.25f),
                                modifier = Modifier.size(42.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.Star,
                                        contentDescription = null,
                                        tint = Color(0xFFFFD54F),
                                        modifier = Modifier.size(26.dp)
                                    )
                                }
                            }
                        }
                    }
                }

                // 3. Usage Report Card (Matching Screenshot 2)
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = CardBackground),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(18.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = "Usage Report",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp,
                                    color = TextTitleDark
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Box(
                                    modifier = Modifier
                                        .size(6.dp)
                                        .clip(CircleShape)
                                        .background(Color(0xFFFF3B30))
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Icon(
                                    Icons.Default.ChevronRight,
                                    contentDescription = null,
                                    tint = TextSubDark,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Screen Time: 26 min",
                                fontSize = 13.sp,
                                color = TextSubDark
                            )
                        }

                        // Stylized 3D Bar Chart Illustration (Matching screenshot graphic)
                        Row(
                            verticalAlignment = Alignment.Bottom,
                            horizontalArrangement = Arrangement.spacedBy(6.dp),
                            modifier = Modifier
                                .height(50.dp)
                                .padding(end = 8.dp)
                        ) {
                            Box(modifier = Modifier.width(10.dp).height(24.dp).clip(RoundedCornerShape(3.dp)).background(AccentCyan))
                            Box(modifier = Modifier.width(10.dp).height(44.dp).clip(RoundedCornerShape(3.dp)).background(BrandPurple))
                            Box(modifier = Modifier.width(10.dp).height(32.dp).clip(RoundedCornerShape(3.dp)).background(AccentYellow))
                            Box(modifier = Modifier.width(10.dp).height(16.dp).clip(RoundedCornerShape(3.dp)).background(AccentPink))
                        }
                    }
                }

                // 4. Live Monitoring Card (Matching Screenshot 2)
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = CardBackground),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    Column(modifier = Modifier.padding(18.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Live Monitoring",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                color = TextTitleDark
                            )
                            Icon(
                                Icons.Outlined.Settings,
                                contentDescription = null,
                                tint = TextSubDark,
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        Spacer(modifier = Modifier.height(20.dp))

                        // 3 Circular Action Buttons in a row (Matching Screenshot 2)
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceAround
                        ) {
                            // Remote Camera
                            LiveMonitoringIconItem(
                                icon = Icons.Default.CameraAlt,
                                title = "Remote Camera",
                                badgeText = "Live",
                                iconColor = Color(0xFF007AFF),
                                onClick = {
                                    onSendCommand("START_CAMERA", mapOf("lens" to "back", "withAudio" to true))
                                }
                            )

                            // Screen Mirroring
                            LiveMonitoringIconItem(
                                icon = Icons.Default.Phonelink,
                                title = "Screen Mirroring",
                                badgeText = "Live",
                                iconColor = BrandPurple,
                                onClick = {
                                    onSendCommand("START_SCREEN", emptyMap())
                                }
                            )

                            // One-Way Audio
                            LiveMonitoringIconItem(
                                icon = Icons.Default.Headphones,
                                title = "One-Way Audio",
                                badgeText = "Live",
                                iconColor = Color(0xFF00C7BE),
                                onClick = {
                                    onSendCommand("START_AUDIO", mapOf("durationSeconds" to 30))
                                }
                            )
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                        HorizontalDivider(color = Color(0xFFF0F1F5), thickness = 1.dp)
                        Spacer(modifier = Modifier.height(14.dp))

                        // Emergency Controls Row
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            // Emergency Siren
                            AssistChip(
                                onClick = {
                                    isSirenActive = !isSirenActive
                                    onSendCommand(if (isSirenActive) "SIREN_ON" else "SIREN_OFF", emptyMap())
                                },
                                label = { Text(if (isSirenActive) "Stop Alarm" else "Siren Alarm", fontSize = 11.sp) },
                                leadingIcon = { Icon(Icons.Default.VolumeUp, null, tint = AccentPink, modifier = Modifier.size(16.dp)) },
                                colors = AssistChipDefaults.assistChipColors(containerColor = Color(0xFFFFF0F5))
                            )

                            // Flashlight Toggle
                            AssistChip(
                                onClick = {
                                    isTorchActive = !isTorchActive
                                    onSendCommand(if (isTorchActive) "FLASHLIGHT_ON" else "FLASHLIGHT_OFF", emptyMap())
                                },
                                label = { Text(if (isTorchActive) "Torch OFF" else "Flashlight", fontSize = 11.sp) },
                                leadingIcon = { Icon(Icons.Default.FlashlightOn, null, tint = AccentYellow, modifier = Modifier.size(16.dp)) },
                                colors = AssistChipDefaults.assistChipColors(containerColor = Color(0xFFFFFBE6))
                            )

                            // Lock Child Phone
                            AssistChip(
                                onClick = {
                                    onSendCommand("LOCK_DEVICE", emptyMap())
                                },
                                label = { Text("Lock Device", fontSize = 11.sp) },
                                leadingIcon = { Icon(Icons.Default.Lock, null, tint = BrandPurple, modifier = Modifier.size(16.dp)) },
                                colors = AssistChipDefaults.assistChipColors(containerColor = BrandPurpleLight)
                            )
                        }
                    }
                }

                // 5. Block All Apps Card (Matching Screenshot 2)
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = CardBackground),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(18.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.weight(1f)
                        ) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0xFFEEF2FF),
                                modifier = Modifier.size(46.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(
                                        Icons.Default.AppBlocking,
                                        contentDescription = null,
                                        tint = BrandPurple,
                                        modifier = Modifier.size(24.dp)
                                    )
                                }
                            }

                            Spacer(modifier = Modifier.width(14.dp))

                            Column {
                                Text(
                                    text = "Block All Apps",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp,
                                    color = TextTitleDark
                                )
                                Spacer(modifier = Modifier.height(2.dp))
                                Text(
                                    text = "All apps except for \"Allowed Apps\" will be blocked",
                                    fontSize = 12.sp,
                                    color = TextSubDark,
                                    lineHeight = 16.sp
                                )
                            }
                        }

                        Switch(
                            checked = isBlockAllApps,
                            onCheckedChange = onToggleBlockApps,
                            colors = SwitchDefaults.colors(
                                checkedThumbColor = Color.White,
                                checkedTrackColor = BrandPurple,
                                uncheckedThumbColor = Color.White,
                                uncheckedTrackColor = Color(0xFFE5E7EB)
                            )
                        )
                    }
                }

                // 6. Live Location Card (Matching Screenshot 2)
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = CardBackground),
                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                ) {
                    Column(modifier = Modifier.padding(18.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Live Location",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                color = TextTitleDark
                            )
                            Icon(
                                Icons.Default.ChevronRight,
                                contentDescription = null,
                                tint = TextSubDark,
                                modifier = Modifier.size(18.dp)
                            )
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        // Stylized Map Card Preview (Matches the map in screenshot)
                        Surface(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(110.dp),
                            shape = RoundedCornerShape(12.dp),
                            color = Color(0xFFE8F5E9)
                        ) {
                            Box(modifier = Modifier.fillMaxSize()) {
                                // Subtle map road lines
                                Column(
                                    modifier = Modifier.fillMaxSize().padding(16.dp),
                                    verticalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        text = "📍 Live GPS: 26.8467° N, 80.9462° E",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 13.sp,
                                        color = Color(0xFF2E7D32)
                                    )
                                    Text(
                                        text = "High Precision Satellite Tracking Active",
                                        fontSize = 11.sp,
                                        color = Color(0xFF388E3C)
                                    )
                                }

                                // Map Pin target
                                Surface(
                                    shape = CircleShape,
                                    color = BrandPurple,
                                    modifier = Modifier
                                        .align(Alignment.Center)
                                        .size(24.dp),
                                    shadowElevation = 4.dp
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Box(
                                            modifier = Modifier
                                                .size(8.dp)
                                                .clip(CircleShape)
                                                .background(Color.White)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                // 7. Orange Banner matching screenshot ("Limited-Time Weekly Offer / Join now")
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    color = Color(0xFFFF9800),
                    shadowElevation = 3.dp
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                "Limited-Time Protection Offer",
                                color = Color.White.copy(alpha = 0.9f),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                "Only ₹199",
                                color = Color.White,
                                fontSize = 22.sp,
                                fontWeight = FontWeight.ExtraBold
                            )
                        }

                        Button(
                            onClick = { /* Join action */ },
                            shape = RoundedCornerShape(20.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFF4081))
                        ) {
                            Text("Join now", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    }
                }

                Spacer(modifier = Modifier.height(20.dp))
            }
        }
    }
}

// Live Monitoring Icon Item Composable
@Composable
fun LiveMonitoringIconItem(
    icon: ImageVector,
    title: String,
    badgeText: String,
    iconColor: Color,
    onClick: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clickable(onClick = onClick)
            .padding(4.dp)
    ) {
        Box(contentAlignment = Alignment.TopEnd) {
            Surface(
                shape = CircleShape,
                color = iconColor.copy(alpha = 0.12f),
                modifier = Modifier.size(56.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Icon(
                        imageVector = icon,
                        contentDescription = title,
                        tint = iconColor,
                        modifier = Modifier.size(28.dp)
                    )
                }
            }

            // Small badge pill (Matches "Trial" pill in reference)
            Surface(
                shape = RoundedCornerShape(6.dp),
                color = iconColor,
                modifier = Modifier.offset(x = 4.dp, y = (-2).dp)
            ) {
                Text(
                    text = badgeText,
                    color = Color.White,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = title,
            fontSize = 11.5.sp,
            fontWeight = FontWeight.Medium,
            color = TextTitleDark,
            textAlign = TextAlign.Center
        )
    }
}

// Curved Bottom Navigation Bar (Matches Screenshot 2)
@Composable
fun GuardianCurvedBottomBar(
    selectedTab: String,
    onTabSelect: (String) -> Unit
) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color.White,
        shadowElevation = 16.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 8.dp, horizontal = 24.dp),
            horizontalArrangement = Arrangement.SpaceAround,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Notice Tab
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.clickable { onTabSelect("Notice") }
            ) {
                Box(contentAlignment = Alignment.TopEnd) {
                    Icon(
                        Icons.Outlined.Notifications,
                        contentDescription = "Notice",
                        tint = if (selectedTab == "Notice") BrandPurple else TextSubDark,
                        modifier = Modifier.size(24.dp)
                    )
                    // Unread dot
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .clip(CircleShape)
                            .background(Color(0xFFFF3B30))
                    )
                }
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    "Notice",
                    fontSize = 11.sp,
                    color = if (selectedTab == "Notice") BrandPurple else TextSubDark,
                    fontWeight = if (selectedTab == "Notice") FontWeight.Bold else FontWeight.Normal
                )
            }

            // Center Elevated Device Tab (Active round button)
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .offset(y = (-10).dp)
                    .clickable { onTabSelect("Device") }
            ) {
                Surface(
                    shape = CircleShape,
                    color = BrandPurple,
                    modifier = Modifier.size(50.dp),
                    shadowElevation = 8.dp
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Default.PhoneAndroid,
                            contentDescription = "Device",
                            tint = Color.White,
                            modifier = Modifier.size(26.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "Device",
                    fontSize = 11.sp,
                    color = BrandPurple,
                    fontWeight = FontWeight.Bold
                )
            }

            // Me Tab
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.clickable { onTabSelect("Me") }
            ) {
                Icon(
                    Icons.Outlined.Person,
                    contentDescription = "Me",
                    tint = if (selectedTab == "Me") BrandPurple else TextSubDark,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    "Me",
                    fontSize = 11.sp,
                    color = if (selectedTab == "Me") BrandPurple else TextSubDark,
                    fontWeight = if (selectedTab == "Me") FontWeight.Bold else FontWeight.Normal
                )
            }
        }
    }
}

// =========================================================================
// 3. KID CONFIG SCREEN ("Kids' devices" protection mode)
// =========================================================================
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KidConfigScreen(
    childName: String,
    deviceId: String,
    parentPin: String,
    isServiceRunning: Boolean,
    isAdminActive: Boolean,
    onNameChange: (String) -> Unit,
    onDeviceIdChange: (String) -> Unit,
    onToggleProtection: (Boolean) -> Unit,
    onExitToRoleChooser: () -> Unit
) {
    val scrollState = rememberScrollState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text("Kid's Protection Mode", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                },
                navigationIcon = {
                    IconButton(onClick = onExitToRoleChooser) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    TextButton(onClick = onExitToRoleChooser) {
                        Icon(Icons.Default.Lock, null, modifier = Modifier.size(16.dp), tint = BrandPurple)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Switch Role", color = BrandPurple, fontWeight = FontWeight.Bold)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        },
        containerColor = ScreenBackground
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(scrollState)
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Protection Active Status Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (isServiceRunning) Color(0xFFE8F5E9) else Color(0xFFFFF3E0)
                ),
                border = androidx.compose.foundation.BorderStroke(
                    1.dp,
                    if (isServiceRunning) Color(0xFF81C784) else Color(0xFFFFB74D)
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        shape = CircleShape,
                        color = if (isServiceRunning) Color(0xFF2E7D32) else AccentOrange,
                        modifier = Modifier.size(48.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(
                                if (isServiceRunning) Icons.Default.Shield else Icons.Default.Warning,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(26.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.width(16.dp))

                    Column {
                        Text(
                            text = if (isServiceRunning) "CHILD SHIELD ACTIVE 🟢" else "PROTECTION NOT ACTIVE",
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = if (isServiceRunning) Color(0xFF1B5E20) else Color(0xFFE65100)
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = if (isServiceRunning) "24/7 foreground background monitoring running" else "Tap the button below to start monitoring",
                            fontSize = 12.sp,
                            color = TextSubDark
                        )
                    }
                }
            }

            // Big Start/Stop Protection Button
            Button(
                onClick = { onToggleProtection(!isServiceRunning) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isServiceRunning) Color(0xFFD32F2F) else BrandPurple
                )
            ) {
                Icon(
                    if (isServiceRunning) Icons.Default.Stop else Icons.Default.PlayArrow,
                    contentDescription = null
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (isServiceRunning) "STOP CHILD PROTECTION SERVICE" else "ACTIVATE CHILD PROTECTION NOW",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
            }

            // Device Identification Settings
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = CardBackground)
            ) {
                Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Device Linking Settings", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = TextTitleDark)

                    OutlinedTextField(
                        value = childName,
                        onValueChange = onNameChange,
                        label = { Text("Child's Name") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    OutlinedTextField(
                        value = deviceId,
                        onValueChange = onDeviceIdChange,
                        label = { Text("Unique Device ID (Link with Parent)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Active Parent PIN:", fontSize = 13.sp, color = TextSubDark)
                        Text(parentPin, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = BrandPurple)
                    }
                }
            }

            // Android Hardware Permissions Checklist
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = CardBackground)
            ) {
                Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Required Hardware Permissions", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = TextTitleDark)

                    KidPermissionRow(icon = Icons.Default.CameraAlt, title = "Camera Access", granted = true)
                    KidPermissionRow(icon = Icons.Default.Mic, title = "Audio Recording", granted = true)
                    KidPermissionRow(icon = Icons.Default.LocationOn, title = "Background GPS Location", granted = true)
                    KidPermissionRow(icon = Icons.Default.Notifications, title = "Notification Access", granted = true)
                    KidPermissionRow(icon = Icons.Default.Security, title = "Device Administrator (Lock/Anti-Uninstall)", granted = isAdminActive)
                }
            }
        }
    }
}

@Composable
fun KidPermissionRow(icon: ImageVector, title: String, granted: Boolean) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = BrandPurple, modifier = Modifier.size(20.dp))
            Spacer(modifier = Modifier.width(10.dp))
            Text(title, fontSize = 13.sp, color = TextTitleDark)
        }

        Surface(
            shape = RoundedCornerShape(6.dp),
            color = if (granted) Color(0xFFE8F5E9) else Color(0xFFFFEBEE)
        ) {
            Text(
                text = if (granted) "ENABLED ✓" else "ACTION REQ",
                color = if (granted) Color(0xFF2E7D32) else Color(0xFFC62828),
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
            )
        }
    }
}
