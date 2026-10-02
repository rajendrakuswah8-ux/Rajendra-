package com.guardian.parentalcontrol.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Guardian Signature White & Royal Purple Theme Colors
val PurplePrimary = Color(0xFF6750A4)
val PurpleDark = Color(0xFF4F378B)
val PurpleLight = Color(0xFFEADDFF)
val PurpleContainer = Color(0xFFF3EDF7)
val PurpleSurface = Color(0xFFF6F2FF)
val BackgroundWhite = Color(0xFFFFFFFF)
val SurfaceWhite = Color(0xFFFDFBFF)
val TextDark = Color(0xFF1D1B20)
val TextMedium = Color(0xFF49454F)
val OnlineGreen = Color(0xFF10B981)
val AlertRed = Color(0xFFEF4444)

private val GuardianWhitePurpleColorScheme = lightColorScheme(
    primary = PurplePrimary,
    onPrimary = Color.White,
    primaryContainer = PurpleLight,
    onPrimaryContainer = Color(0xFF21005D),
    secondary = PurpleDark,
    onSecondary = Color.White,
    background = BackgroundWhite,
    onBackground = TextDark,
    surface = SurfaceWhite,
    onSurface = TextDark,
    surfaceVariant = PurpleContainer,
    onSurfaceVariant = TextMedium
)

@Composable
fun GuardianTheme(
    content: @Composable () -> Unit
) {
    // Always enforce the signature White & Purple theme so it matches the parent dashboard
    MaterialTheme(
        colorScheme = GuardianWhitePurpleColorScheme,
        content = content
    )
}
