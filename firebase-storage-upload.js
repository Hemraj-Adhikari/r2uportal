/* ═══════════════════════════════════════════════════════
   FIREBASE STORAGE UPLOAD  ·  Route2Uni CRM Portal
   Replaces uploadFileToCloudinary() — same call shape, new backend.
   Requires: <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-storage-compat.js"></script>
   added to index.html (alongside the existing firestore/auth/functions tags).
═══════════════════════════════════════════════════════ */

const storage = firebase.storage();

const STORAGE_MAX_SIZE  = 10 * 1024 * 1024; // 10MB
const STORAGE_ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/**
 * uploadFileToStorage(file, studentId, docType)
 * Drop-in replacement for uploadFileToCloudinary(file, studentId, docType).
 * Returns { url, path, name, size, type } on success.
 */
async function uploadFileToStorage(file, studentId, docType) {
  if (!file) throw new Error('No file provided');
  if (!studentId) throw new Error('studentId is required');

  if (file.size > STORAGE_MAX_SIZE) {
    throw new Error('File exceeds 10MB limit');
  }
  if (!STORAGE_ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Unsupported file type: ' + (file.type || 'unknown'));
  }

  const safeDocType = (docType || 'general').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeName     = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const path = `students/${studentId}/${safeDocType}/${Date.now()}_${safeName}`;
  const ref  = storage.ref(path);

  const uploadTask = ref.put(file, {
    contentType: file.type,
    customMetadata: {
      uploadedBy: window.staff?.email || 'unknown',
      studentId,
      docType: safeDocType
    }
  });

  return new Promise((resolve, reject) => {
    uploadTask.on('state_changed',
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        if (typeof toast === 'function') toast(`Uploading… ${pct}%`, 'info');
      },
      (err) => {
        console.error('[uploadFileToStorage] failed:', err);
        if (typeof toast === 'function') toast('Upload failed: ' + err.message, 'error');
        reject(err);
      },
      async () => {
        try {
          const url = await uploadTask.snapshot.ref.getDownloadURL();
          resolve({ url, path, name: file.name, size: file.size, type: file.type });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

/**
 * deleteFileFromStorage(path)
 * Use the `path` returned from uploadFileToStorage (not the download URL)
 * to delete a file — e.g. when a document is replaced or removed.
 */
async function deleteFileFromStorage(path) {
  if (!path) return;
  try {
    await storage.ref(path).delete();
  } catch (err) {
    console.warn('[deleteFileFromStorage] failed (file may already be gone):', err);
  }
}

console.log('[firebase-storage-upload.js] loaded ✅');
