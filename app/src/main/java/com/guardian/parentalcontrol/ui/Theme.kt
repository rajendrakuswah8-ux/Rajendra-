package com.guardian.parentalcontrol.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Guardian Signature White & Pink Theme Colors
val PinkPrimary = Color(0xFFE91E63)
val PinkDark = Color(0xFFC2185B)
val PinkLight = Color(0xFFF8BBD0)
val PinkContainer = Color(0xFFFCE4EC)
val PinkSurface = Color(0xFFFFF5F8)
val BackgroundWhite = Color(0xFFFFFFFF)
val SurfaceWhite = Color(0xFFFFFFFF)
val ScreenBackground = Color(0xFFFAFAFC)
val TextDark = Color(0xFF1E1E26)
val TextMedium = Color(0xFF5A5D6B)
val TextLight = Color(0xFF8E90A0)
val OnlineGreen = Color(0xFF10B981)
val OfflineGray = Color(0xFF9E9E9E)
val AlertRed = Color(0xFFEF4444)

private val GuardianWhitePinkColorScheme = lightColorScheme(
    primary = PinkPrimary,
    onPrimary = Color.White,
    primaryContainer = PinkContainer,
    onPrimaryContainer = PinkDark,
    secondary = PinkDark,
    onSecondary = Color.White,
    background = ScreenBackground,
    onBackground = TextDark,
    surface = SurfaceWhite,
    onSurface = TextDark,
    surfaceVariant = PinkContainer,
    onSurfaceVariant = TextMedium
)

@Composable
fun GuardianTheme(
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = GuardianWhitePinkColorScheme,
        content = content
    )
}
