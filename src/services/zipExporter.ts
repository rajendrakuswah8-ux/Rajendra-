import JSZip from 'jszip';
import { ANDROID_PROJECT_FILES } from './androidProjectFiles';
import firebaseConfig from '../../firebase-applet-config.json';

export async function downloadAndroidProjectZip(): Promise<void> {
  const zip = new JSZip();

  // Add all project source files
  ANDROID_PROJECT_FILES.forEach((file) => {
    zip.file(`guardian-android/${file.path}`, file.content);
  });

  // Also include the google-services.json generated from the live Firebase configuration!
  const googleServicesJson = {
    project_info: {
      project_number: firebaseConfig.messagingSenderId || '529929535607',
      project_id: firebaseConfig.projectId,
      storage_bucket: firebaseConfig.storageBucket,
    },
    client: [
      {
        client_info: {
          mobilesdk_app_id: firebaseConfig.appId,
          android_client_info: {
            package_name: 'com.guardian.parentalcontrol',
          },
        },
        oauth_client: [
          {
            client_id: firebaseConfig.oAuthClientId || '',
            client_type: 3,
          },
        ],
        api_key: [
          {
            current_key: firebaseConfig.apiKey,
          },
        ],
        services: {
          appinvite_service: {
            other_platform_oauth_client: [],
          },
        },
      },
    ],
    configuration_version: '1',
  };

  zip.file(
    'guardian-android/app/google-services.json',
    JSON.stringify(googleServicesJson, null, 2)
  );

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'guardian-android-parental-control.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
