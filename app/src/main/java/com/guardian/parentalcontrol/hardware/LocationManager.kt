package com.guardian.parentalcontrol.hardware

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import com.google.android.gms.location.*
import com.guardian.parentalcontrol.data.DeviceLocation
import kotlinx.coroutines.tasks.await

class LocationManager(private val context: Context) {

    private val fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)

    @SuppressLint("MissingPermission")
    suspend fun getCurrentLocation(): DeviceLocation {
        return try {
            val location: Location? = fusedLocationClient.getCurrentLocation(
                Priority.PRIORITY_HIGH_ACCURACY,
                null
            ).await()

            if (location != null) {
                DeviceLocation(
                    latitude = location.latitude,
                    longitude = location.longitude,
                    accuracy = location.accuracy,
                    timestamp = location.time,
                    permissionStatus = "granted"
                )
            } else {
                DeviceLocation(
                    latitude = 0.0,
                    longitude = 0.0,
                    accuracy = 0f,
                    timestamp = System.currentTimeMillis(),
                    permissionStatus = "unavailable",
                    errorMessage = "Location provider returned null. Ensure device GPS is active."
                )
            }
        } catch (e: SecurityException) {
            DeviceLocation(
                latitude = 0.0,
                longitude = 0.0,
                accuracy = 0f,
                timestamp = System.currentTimeMillis(),
                permissionStatus = "denied",
                errorMessage = "Location permission is not granted."
            )
        } catch (e: Exception) {
            DeviceLocation(
                latitude = 0.0,
                longitude = 0.0,
                accuracy = 0f,
                timestamp = System.currentTimeMillis(),
                permissionStatus = "unavailable",
                errorMessage = e.localizedMessage ?: "Unknown location error"
            )
        }
    }
}
