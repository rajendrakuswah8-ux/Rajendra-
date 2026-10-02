package com.guardian.parentalcontrol.hardware

import android.app.AppOpsManager
import android.app.usage.UsageStats
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Process
import java.util.Calendar

data class RealAppUsage(
    val packageName: String,
    val totalTimeInForegroundMs: Long
)

class UsageStatsHelper(private val context: Context) {

    private val usageStatsManager =
        context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager

    fun hasPermission(): Boolean {
        val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = appOps.unsafeCheckOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            context.packageName
        )
        return mode == AppOpsManager.MODE_ALLOWED
    }

    fun getTodayUsage(): List<RealAppUsage> {
        if (!hasPermission() || usageStatsManager == null) return emptyList()

        val calendar = Calendar.getInstance()
        calendar.set(Calendar.HOUR_OF_DAY, 0)
        calendar.set(Calendar.MINUTE, 0)
        calendar.set(Calendar.SECOND, 0)
        val startTime = calendar.timeInMillis
        val endTime = System.currentTimeMillis()

        val stats: List<UsageStats> = usageStatsManager.queryUsageStats(
            UsageStatsManager.INTERVAL_DAILY,
            startTime,
            endTime
        ) ?: return emptyList()

        return stats.filter { it.totalTimeInForeground > 0 }
            .map { RealAppUsage(it.packageName, it.totalTimeInForeground) }
            .sortedByDescending { it.totalTimeInForegroundMs }
    }
}
