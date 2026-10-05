// ↪️ Forwarding. Messages are end-to-end encrypted, so the server can't copy one
// into another chat: the browser encrypts it again for the people in that chat
// (and its photo, recording or document too), exactly like a new message.
import { api } from './client';
import { decryptDocument, decryptImage, decryptMedia, encryptFile, encryptMessage } from './e2ee';
import { isWrappedFor } from './gifts';

// How many chats one message can be forwarded to in one go
export const MAX_FORWARD_CHATS = 5;

// Not view-once photos, unopened gifts, forgiveness requests or notes in the chat
export function canForward(message, myId) {
  return (
    message.messageType !== 'event' &&
    !message.isDeleted &&
    !message.undecryptable &&
    !message.pending &&
    !message.failed &&
    !message.forgiveness &&
    message.ghostClick?.mode !== 'once' &&
    !(message.gift && isWrappedFor(message, myId)) &&
    Boolean(message.text || message.sticker || message.image || message.media)
  );
}

// Chats I can write in right now
export function canForwardTo(conversation, myId) {
  const ghostedByThem = conversation.ghost && conversation.ghost.by !== myId && conversation.ghost.level !== 'soft';
  return !conversation.pausedBy && !conversation.blockedByMe && !conversation.isRequest && !ghostedByThem;
}

async function blobOf(objectUrl) {
  const response = await fetch(objectUrl);
  return response.blob();
}

// The message's attachment, unlocked: { blob, context, payload } or null
async function attachmentOf(message) {
  const { contentKey } = message;
  if (message.image) {
    const type = message.imageType || 'image/webp';
    return {
      blob: await blobOf(message.localImage || (await decryptImage(message.image, contentKey, type))),
      context: 'image',
      payload: { image: { type, width: message.imageWidth, height: message.imageHeight } },
    };
  }
  if (message.media && message.messageType === 'file') {
    return {
      blob: await blobOf(message.localMedia || (await decryptDocument(message.media, contentKey, message.fileType))),
      context: 'file',
      payload: { file: { name: message.fileName, type: message.fileType, size: message.fileSize } },
    };
  }
  if (message.media) {
    return {
      blob: await blobOf(message.localMedia || (await decryptMedia(message.media, contentKey, message.mediaType))),
      context: 'media',
      payload: {
        media: {
          kind: message.messageType,
          type: message.mediaType,
          duration: message.mediaDuration,
          waveform: message.mediaWaveform,
          mirrored: message.mediaMirrored,
        },
      },
    };
  }
  return null;
}

// Sends a copy of `message` to `conversation`. Resolves to the saved message.
export async function forwardMessage(message, conversation) {
  const conversationId = conversation._id;
  const attachment = await attachmentOf(message);
  const payload = {
    text: message.text || '',
    forwarded: true,
    ...(message.sticker && { sticker: message.sticker }),
    ...(message.stickerImage && { stickerImage: true }),
    ...attachment?.payload,
  };

  async function encryptAndSend(members) {
    const { encrypted, contentKey } = await encryptMessage({ conversationId, members, payload });
    let url = '';
    if (attachment) {
      const file = await encryptFile(contentKey, attachment.blob, attachment.context);
      url = (await api('/api/upload/encrypted', { method: 'POST', file })).url;
    }
    const isImage = attachment?.context === 'image';
    return api('/api/messages', {
      method: 'POST',
      body: {
        conversationId,
        ...encrypted,
        image: isImage ? url : '',
        ...(url && !isImage && { media: url, mediaKind: message.messageType }),
      },
    });
  }

  try {
    return (await encryptAndSend(conversation.participants || [])).message;
  } catch (err) {
    if (err.code !== 'KEYS_CHANGED') throw err;
    // Someone joined, left or got new keys since the list loaded: refresh and try once more
    const { conversation: fresh } = await api(`/api/conversations/${conversationId}`);
    return (await encryptAndSend(fresh.participants)).message;
  }
}
