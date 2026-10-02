package com.guardian.parentalcontrol.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

object GuardianCloudSync {

    private const val BASE_NTFY = "https://ntfy.sh"

    // Parent publishes pairing code to the cloud
    suspend fun publishPairingCode(code: String, guardianId: String, expiresAt: Long): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val url = URL("$BASE_NTFY/guardian_code_$code")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.connectTimeout = 8000
                conn.readTimeout = 8000
                conn.setRequestProperty("Content-Type", "text/plain")

                val payload = JSONObject().apply {
                    put("code", code)
                    put("guardianId", guardianId)
                    put("expiresAt", expiresAt)
                    put("timestamp", System.currentTimeMillis())
                }

                OutputStreamWriter(conn.outputStream).use { writer ->
                    writer.write(payload.toString())
                    writer.flush()
                }

                conn.responseCode in 200..299
            } catch (e: Exception) {
                e.printStackTrace()
                false
            }
        }
    }

    // Child resolves 6-digit code to Guardian ID
    suspend fun resolvePairingCode(code: String): String? {
        return withContext(Dispatchers.IO) {
            try {
                val url = URL("$BASE_NTFY/guardian_code_$code/json?poll=1")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.connectTimeout = 10000
                conn.readTimeout = 10000

                if (conn.responseCode in 200..299) {
                    val reader = BufferedReader(InputStreamReader(conn.inputStream))
                    val lines = reader.readLines()
                    for (line in lines.reversed()) {
                        try {
                            val json = JSONObject(line)
                            if (json.optString("event") == "message") {
                                val msgStr = json.optString("message")
                                val innerJson = JSONObject(msgStr)
                                val guardianId = innerJson.optString("guardianId")
                                val expiresAt = innerJson.optLong("expiresAt", Long.MAX_VALUE)
                                if (System.currentTimeMillis() < expiresAt && guardianId.isNotBlank()) {
                                    return@withContext guardianId
                                }
                            }
                        } catch (ignored: Exception) {}
                    }
                }
                null
            } catch (e: Exception) {
                e.printStackTrace()
                null
            }
        }
    }

    // Child sends full telemetry, live permissions, and GPS location to Parent
    suspend fun sendChildTelemetry(
        guardianId: String,
        deviceId: String,
        deviceName: String,
        batteryLevel: Int,
        isOnline: Boolean,
        permissions: JSONObject,
        location: JSONObject?,
        lastCommandResponse: JSONObject? = null
    ): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val url = URL("$BASE_NTFY/guardian_parent_$guardianId")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.connectTimeout = 8000
                conn.readTimeout = 8000
                conn.setRequestProperty("Content-Type", "text/plain")

                val payload = JSONObject().apply {
                    put("event", "CHILD_UPDATE")
                    put("deviceId", deviceId)
                    put("deviceName", deviceName)
                    put("batteryLevel", batteryLevel)
                    put("isOnline", isOnline)
                    put("lastSeen", System.currentTimeMillis())
                    put("permissions", permissions)
                    if (location != null) put("location", location)
                    if (lastCommandResponse != null) put("lastCommandResponse", lastCommandResponse)
                }

                OutputStreamWriter(conn.outputStream).use { writer ->
                    writer.write(payload.toString())
                    writer.flush()
                }

                conn.responseCode in 200..299
            } catch (e: Exception) {
                e.printStackTrace()
                false
            }
        }
    }

    // Parent fetches real-time updates from children
    suspend fun pollChildUpdates(guardianId: String): List<JSONObject> {
        return withContext(Dispatchers.IO) {
            val list = mutableListOf<JSONObject>()
            try {
                val url = URL("$BASE_NTFY/guardian_parent_$guardianId/json?poll=1")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.connectTimeout = 8000
                conn.readTimeout = 8000

                if (conn.responseCode in 200..299) {
                    val reader = BufferedReader(InputStreamReader(conn.inputStream))
                    reader.forEachLine { line ->
                        try {
                            val eventObj = JSONObject(line)
                            if (eventObj.optString("event") == "message") {
                                val msgObj = JSONObject(eventObj.optString("message"))
                                list.add(msgObj)
                            }
                        } catch (ignored: Exception) {}
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
            list
        }
    }

    // Parent sends structured command to Child
    suspend fun sendRemoteCommand(
        deviceId: String,
        commandType: String,
        commandId: String = "cmd_" + System.currentTimeMillis() + "_" + (100..999).random(),
        guardianId: String = "",
        payload: JSONObject = JSONObject()
    ): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val url = URL("$BASE_NTFY/guardian_cmd_$deviceId")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.connectTimeout = 8000
                conn.readTimeout = 8000
                conn.setRequestProperty("Content-Type", "text/plain")

                val cmdObj = JSONObject().apply {
                    put("commandId", commandId)
                    put("command", commandType)
                    put("type", commandType)
                    put("guardianId", guardianId)
                    put("deviceId", deviceId)
                    put("payload", payload)
                    put("timestamp", System.currentTimeMillis())
                }

                OutputStreamWriter(conn.outputStream).use { writer ->
                    writer.write(cmdObj.toString())
                    writer.flush()
                }

                conn.responseCode in 200..299
            } catch (e: Exception) {
                e.printStackTrace()
                false
            }
        }
    }

    // Child polls for structured commands
    suspend fun pollRemoteCommands(deviceId: String): List<JSONObject> {
        return withContext(Dispatchers.IO) {
            val list = mutableListOf<JSONObject>()
            try {
                val url = URL("$BASE_NTFY/guardian_cmd_$deviceId/json?poll=1")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "GET"
                conn.connectTimeout = 5000
                conn.readTimeout = 5000

                if (conn.responseCode in 200..299) {
                    val reader = BufferedReader(InputStreamReader(conn.inputStream))
                    reader.forEachLine { line ->
                        try {
                            val eventObj = JSONObject(line)
                            if (eventObj.optString("event") == "message") {
                                val msgObj = JSONObject(eventObj.optString("message"))
                                list.add(msgObj)
                            }
                        } catch (ignored: Exception) {}
                    }
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
            list
        }
    }
}
