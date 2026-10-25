/**
 * Google Drive Workspace Integration Service
 * Manages OAuth Access Token (in-memory only), Folder Creation, 
 * PDF Upload, Backup Sync, Listing, and Deletion.
 */

import { GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth';
import { auth } from '../firebase';

export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.activity',
  'https://www.googleapis.com/auth/drive.activity.readonly',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive.apps.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.install',
  'https://www.googleapis.com/auth/drive.meet.readonly',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/drive.photos.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.scripts'
];

// In-memory token cache (never stored in localStorage/sessionStorage as per security guidelines)
let cachedAccessToken: string | null = null;

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
}

export function isDriveConnected(): boolean {
  return !!cachedAccessToken;
}

export function getCachedDriveToken(): string | null {
  return cachedAccessToken;
}

export function clearDriveToken(): void {
  cachedAccessToken = null;
}

/**
 * Initiates Google OAuth popup with Drive scopes and caches accessToken in memory
 */
export async function connectGoogleDrive(): Promise<{ user: User; accessToken: string }> {
  const provider = new GoogleAuthProvider();
  DRIVE_SCOPES.forEach((scope) => provider.addScope(scope));
  // Force consent dialog so user is prompted to check Drive permissions
  provider.setCustomParameters({
    prompt: 'consent',
    access_type: 'offline'
  });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  
  if (!credential?.accessToken) {
    throw new Error('Failed to obtain Google Drive access token from authentication.');
  }

  cachedAccessToken = credential.accessToken;
  return { user: result.user, accessToken: cachedAccessToken };
}

/**
 * Locates or creates the official "RPF TA Journals" folder in the user's Google Drive
 */
export async function getOrCreateAppFolder(token: string): Promise<string> {
  const query = encodeURIComponent("name = 'RPF TA Journals' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!searchRes.ok) {
    const errData = await searchRes.json().catch(() => ({}));
    const errMsg = errData.error?.message || searchRes.statusText;
    if (searchRes.status === 401 || searchRes.status === 403 || errMsg.includes('insufficient')) {
      clearDriveToken();
      throw new Error(`Google Drive permissions insufficient or session expired. Please click "Connect Google Drive" again and make sure to check the permission boxes to allow access.`);
    }
    throw new Error(`Failed to query Google Drive: ${errMsg}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Folder doesn't exist, create it
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'RPF TA Journals',
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Official Travelling Allowance Journals and Backups from RPF TA Companion'
    })
  });

  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(`Failed to create Google Drive folder: ${errData.error?.message || createRes.statusText}`);
  }

  const folderData = await createRes.json();
  return folderData.id;
}

/**
 * Uploads a file (PDF Blob or text/JSON) to Google Drive inside the RPF TA Journals folder
 */
export async function uploadFileToDrive(
  token: string,
  fileName: string,
  fileContent: Blob | string,
  mimeType: string,
  folderId?: string
): Promise<DriveFileItem> {
  const targetFolderId = folderId || (await getOrCreateAppFolder(token));

  const metadata = {
    name: fileName,
    mimeType: mimeType,
    parents: [targetFolderId]
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  let body: any;

  if (typeof fileContent === 'string') {
    body = 
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${mimeType}\r\n\r\n` +
      fileContent +
      closeDelimiter;
  } else {
    // Binary or Blob (like PDF)
    const metadataPart = new Blob(
      [
        delimiter,
        'Content-Type: application/json; charset=UTF-8\r\n\r\n',
        JSON.stringify(metadata),
        delimiter,
        `Content-Type: ${mimeType}\r\n\r\n`
      ],
      { type: 'text/plain' }
    );
    const closePart = new Blob([closeDelimiter], { type: 'text/plain' });
    body = new Blob([metadataPart, fileContent, closePart]);
  }

  const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,createdTime,modifiedTime,size,webViewLink,iconLink';

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`
    },
    body: body
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`Drive Upload Error: ${errData.error?.message || res.statusText}`);
  }

  return await res.json();
}

/**
 * Lists all files in the "RPF TA Journals" folder
 */
export async function listDriveJournals(token: string): Promise<DriveFileItem[]> {
  const folderId = await getOrCreateAppFolder(token);
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink,iconLink,thumbnailLink)&orderBy=modifiedTime desc`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`Drive List Error: ${errData.error?.message || res.statusText}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Downloads file content as text (useful for restoring JSON backups)
 */
export async function downloadDriveFileText(token: string, fileId: string): Promise<string> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error(`Failed to download file from Google Drive (Status: ${res.status})`);
  }

  return await res.text();
}

/**
 * Deletes a file from Google Drive with mandatory user confirmation
 */
export async function deleteDriveFile(
  token: string, 
  fileId: string, 
  fileName: string,
  userConfirmed: boolean
): Promise<void> {
  if (!userConfirmed) {
    throw new Error('Action aborted: User confirmation is required before deleting any file from Google Drive.');
  }

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok && res.status !== 204) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(`Delete failed: ${errData.error?.message || res.statusText}`);
  }
}
