export interface DriveExcelFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  size?: string;
  ownedByMe?: boolean;
}

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function listDriveExcelFiles(
  accessToken: string
): Promise<DriveExcelFile[]> {
  const query = encodeURIComponent(
    `trashed = false and (mimeType = '${XLSX_MIME}' or name contains '.xlsx')`
  );
  const fields = encodeURIComponent(
    'files(id,name,mimeType,modifiedTime,webViewLink,size,ownedByMe)'
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&pageSize=25&fields=${fields}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg =
      (errBody as { error?: { message?: string } }).error?.message ||
      'Gagal membaca daftar file Excel dari Google Drive.';
    throw new Error(msg);
  }

  const data = (await res.json()) as { files?: DriveExcelFile[] };
  return data.files ?? [];
}

export async function uploadNewExcelToDrive(
  accessToken: string,
  blob: Blob,
  fileName: string
): Promise<DriveExcelFile> {
  const metadata = {
    name: fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`,
    mimeType: XLSX_MIME,
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append('file', blob, metadata.name);

  const fields = encodeURIComponent(
    'id,name,mimeType,modifiedTime,webViewLink,size,ownedByMe'
  );
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${fields}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg =
      (errBody as { error?: { message?: string } }).error?.message ||
      'Gagal menyimpan file Excel baru ke Google Drive.';
    throw new Error(msg);
  }

  return (await res.json()) as DriveExcelFile;
}

export async function updateExistingExcelInDrive(
  accessToken: string,
  fileId: string,
  blob: Blob
): Promise<DriveExcelFile> {
  const fields = encodeURIComponent(
    'id,name,mimeType,modifiedTime,webViewLink,size,ownedByMe'
  );
  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=${fields}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': XLSX_MIME,
      },
      body: blob,
    }
  );

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg =
      (errBody as { error?: { message?: string } }).error?.message ||
      'Gagal memperbarui file Excel di Google Drive. Pastikan file dibuat oleh aplikasi ini.';
    throw new Error(msg);
  }

  return (await res.json()) as DriveExcelFile;
}

export async function downloadDriveFileAsBase64(
  accessToken: string,
  fileId: string
): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw new Error('Gagal mengunduh file Excel dari Google Drive.');
  }

  const arrayBuffer = await res.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
