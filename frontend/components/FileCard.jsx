'use client';

import { useState } from 'react';
import { Download, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, File as FileIcon, Loader2 } from 'lucide-react';
import { decryptDocument } from '@/lib/e2ee';

// What a document may weigh. The server caps the encrypted upload at 32 MB
// (MAX_ENCRYPTED_SIZE in backend/utils/storage.js), so this leaves room.
export const MAX_DOCUMENT_SIZE = 30 * 1024 * 1024;

// The same check the server would make, but said kindly and before the upload
export function checkDocumentFile(file) {
  if (!file) return 'No file was picked.';
  if (!file.size) return "That file is empty, so there's nothing to send.";
  if (file.size > MAX_DOCUMENT_SIZE) {
    return `Documents can be up to ${Math.round(MAX_DOCUMENT_SIZE / (1024 * 1024))} MB. That one is ${formatFileSize(file.size)}.`;
  }
  return '';
}

export function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

// The icon matches the kind of file, so a PDF and a zip don't look the same
function iconFor(name = '', type = '') {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (type.startsWith('image/')) return FileImage;
  if (type.startsWith('video/')) return FileVideo;
  if (type.startsWith('audio/')) return FileAudio;
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return FileArchive;
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return FileSpreadsheet;
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'md', 'odt', 'ppt', 'pptx'].includes(ext)) return FileText;
  return FileIcon;
}

// 📎 A shared document in the chat: name, size and a download button. The file
// is only downloaded and decrypted when it's actually asked for — documents can
// be big, and nobody wants every chat to fetch them on the way past.
export default function FileCard({ message, isMine }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const name = message.fileName || 'Document';
  const size = message.fileSize || 0;
  const Icon = iconFor(name, message.fileType || '');
  // My own copy is already here; the other side has to fetch and unlock it
  const missing = !message.media && !message.pending;

  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const url = message.localMedia || (await decryptDocument(message.media, message.contentKey, message.fileType));
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError("That file couldn't be opened.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            isMine ? 'bg-black/15' : 'bg-brand-soft text-brand'
          }`}
        >
          <Icon size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{name}</span>
          <span className={`block text-xs ${isMine ? 'opacity-75' : 'text-muted'}`}>
            {size ? formatFileSize(size) : 'Document'}
            {message.pending && ' · sending…'}
          </span>
        </span>
        {!missing && !message.pending && (
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-60 ${
              isMine ? 'bg-black/15 hover:bg-black/25' : 'bg-brand-soft text-brand hover:bg-hover'
            }`}
            aria-label={`Save ${name}`}
            title="Save"
          >
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
          </button>
        )}
      </div>
      {missing && <p className={`mt-1 text-xs ${isMine ? 'opacity-75' : 'text-muted'}`}>This document is no longer available.</p>}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}
