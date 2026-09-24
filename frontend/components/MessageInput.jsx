'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Mic, Plus, SendHorizontal, Smile, X } from 'lucide-react';
import { useChat } from './ChatProvider';
import VoiceRecorder from './VoiceRecorder';
import { checkImageFile } from './ImagePreview';
import GifPicker from './GifPicker';
import { messagePreview } from '@/lib/format';
import { isOnlyEmoji } from '@/lib/ghost';
import { canRecord } from '@/lib/recording';
import { gifsAvailable } from '@/lib/gifs';
import { STICKER_PACKS, stickerUrl } from '@/lib/stickers';

const EMOJIS = [
  '😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤔', '😅', '😉', '🙂',
  '😢', '😭', '😡', '😮', '😴', '🤗', '🙄', '😬', '🥳', '😇', '🤩', '😤',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '👋', '🤝', '❤️', '💔', '🔥', '✨',
  '🎉', '💯', '✅', '❌', '👀', '🤞', '☕', '🍕', '⚽', '🎂', '🌟', '😺',
];

const TYPING_REPEAT_MS = 3000; // re-send "typing" at most every 3s while typing
const TYPING_IDLE_MS = 2000; // send "stopTyping" after 2s without a keystroke
// "Almost said": a draft typed for at least 8s and 10 characters, then deleted
const ALMOST_SAID_MS = 8000;
const ALMOST_SAID_CHARS = 10;
const MAX_LENGTH = 4000;

export default function MessageInput({
  conversationId,
  replyingTo,
  replyName,
  emojiOnly = false, // deep ghost: only emojis can be sent, no photos
  onCancelReply,
  onSendText,
  onCamera, // 📷 opens the camera (tap = photo, hold = video)
  onPickImage, // 🎞️ (file) a picture pasted in, or added by the keyboard's GIF/sticker buttons
  onSendSticker, // 🌟 (id) sends a built-in sticker
  onSendCustomSticker, // 🌟 (url) sends a sticker from an installed pack
  onOpenStickerStore, // 🌟 opens the sticker packs screen
  onSendVoice, // 🎤 ({ blob, duration, waveform }) a recorded voice message
  onError,
}) {
  const { socket, stickerPacks } = useChat();
  const [text, setText] = useState('');
  const [showEmojis, setShowEmojis] = useState(emojiOnly);
  const [panel, setPanel] = useState('emoji'); // emoji | stickers | gifs
  const [hasGifs, setHasGifs] = useState(false); // shown only if the server has a GIF key
  const [isRecording, setIsRecording] = useState(false);
  // Checked after mounting, since the server render has no MediaRecorder
  const [recordingSupported, setRecordingSupported] = useState(false);
  const boxRef = useRef(null);
  const typing = useRef({ active: false, lastSent: 0, timer: null });
  const draftRef = useRef({ startedAt: 0, longest: 0 });
  const socketRef = useRef(socket);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => setRecordingSupported(canRecord()), []);

  // 🎞️ The GIF tab only exists when the server can search GIFs
  useEffect(() => {
    let cancelled = false;
    gifsAvailable().then((available) => !cancelled && setHasGifs(available));
    return () => {
      cancelled = true;
    };
  }, []);

  function stopTyping() {
    const t = typing.current;
    clearTimeout(t.timer);
    if (t.active) {
      socketRef.current?.emit('stopTyping', { conversationId });
      t.active = false;
      t.lastSent = 0;
    }
  }

  function notifyTyping() {
    const t = typing.current;
    const now = Date.now();
    if (now - t.lastSent > TYPING_REPEAT_MS) {
      socketRef.current?.emit('typing', { conversationId });
      t.lastSent = now;
    }
    t.active = true;
    clearTimeout(t.timer);
    t.timer = setTimeout(stopTyping, TYPING_IDLE_MS);
  }

  // Leaving the chat counts as "stopped typing"
  useEffect(() => stopTyping, []);

  // Focus the input when the user picks "Reply"
  useEffect(() => {
    if (replyingTo) boxRef.current?.focus();
  }, [replyingTo]);

  // Just got ghosted: open the emoji picker, since that's all that can be sent
  useEffect(() => {
    if (emojiOnly) setShowEmojis(true);
  }, [emojiOnly]);

  const trimmed = text.trim();
  const canSend = Boolean(trimmed) && (!emojiOnly || isOnlyEmoji(trimmed));
  // With nothing typed, the send button becomes a mic (like WhatsApp)
  const canRecordVoice = recordingSupported && !emojiOnly && Boolean(onSendVoice);
  // Being ghosted means emojis only — no stickers until that's over
  const canSendStickers = !emojiOnly && Boolean(onSendSticker);
  const placeholder = emojiOnly ? 'Emojis only' : 'Type a message';
  const showMic = canRecordVoice && !trimmed;

  function handleChange(event) {
    const box = event.currentTarget;
    let value = box.innerText.replace(/\n$/, ''); // the browser keeps a trailing newline
    if (value.length > MAX_LENGTH) {
      value = value.slice(0, MAX_LENGTH);
      box.textContent = value;
      placeCaretAtEnd(box);
    }
    setText(value);
    if (value.trim()) {
      notifyTyping();
      // 🫥 Remember when this draft started and how long it got
      const draft = draftRef.current;
      if (!draft.startedAt) draft.startedAt = Date.now();
      draft.longest = Math.max(draft.longest, value.trim().length);
    } else {
      stopTyping();
      // Typed for a while, then deleted it all: "They typed something... then disappeared."
      // Only that fact is shared, never the text.
      const draft = draftRef.current;
      if (draft.startedAt && Date.now() - draft.startedAt >= ALMOST_SAID_MS && draft.longest >= ALMOST_SAID_CHARS) {
        socketRef.current?.emit('almostSaid', { conversationId });
      }
      draftRef.current = { startedAt: 0, longest: 0 };
    }
  }

  function send() {
    if (!trimmed) return;
    if (!canSend) return onError('You can only send emojis.');
    onSendText(trimmed);
    if (boxRef.current) boxRef.current.textContent = '';
    setText('');
    setShowEmojis(emojiOnly);
    stopTyping();
    draftRef.current = { startedAt: 0, longest: 0 }; // it was sent, not abandoned
  }

  function handleKeyDown(event) {
    // On a physical keyboard Enter sends and Shift+Enter adds a new line.
    // On phones Enter adds a new line and the send button sends.
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
    if (event.key === 'Enter' && !event.shiftKey && !isTouchDevice) {
      event.preventDefault();
      send();
    }
  }

  // Pasting into a rich-text box would bring formatting (and whole web pages)
  // with it, so text is inserted plainly. A picture goes to the handler below.
  function handlePaste(event) {
    if (handleInsertedImage(event)) return;
    const plain = event.clipboardData?.getData('text/plain');
    if (plain === undefined) return;
    event.preventDefault();
    document.execCommand?.('insertText', false, plain.slice(0, MAX_LENGTH));
    handleChange({ currentTarget: event.currentTarget });
  }

  // 🎞️ The phone keyboard's own GIF and sticker buttons (and copy-paste, and
  // dropping a file) put a picture into the message box. Browsers deliver that
  // as a paste / insertion event carrying a file, which we send as a photo.
  function handleInsertedImage(event) {
    const transfer = event.clipboardData || event.dataTransfer;
    const file = [...(transfer?.files || [])].find((f) => f.type.startsWith('image/'));
    if (!file || !onPickImage) return false;

    event.preventDefault(); // don't also drop the file name into the box
    const problem = checkImageFile(file);
    if (problem) onError(problem);
    else onPickImage(file);
    return true;
  }

  // Puts the cursor back at the end after the text was replaced
  function placeCaretAtEnd(box) {
    const range = document.createRange();
    range.selectNodeContents(box);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  function insertEmoji(emoji) {
    const box = boxRef.current;
    if (!box) return;
    box.focus();
    // Types it in at the cursor, and leaves an undo step behind
    if (!document.execCommand?.('insertText', false, emoji)) {
      box.textContent += emoji;
      placeCaretAtEnd(box);
    }
    setText(box.innerText.replace(/\n$/, ''));
    notifyTyping();
  }

  return (
    <div className="shrink-0 border-t border-line bg-panel pb-[var(--safe-bottom)]">
      {replyingTo && (
        <div className="flex items-center gap-2 px-3 pt-2">
          <div className="min-w-0 flex-1 rounded-lg border-l-4 border-brand bg-panel-soft px-3 py-1.5">
            <p className="text-xs font-semibold text-brand">Replying to {replyName}</p>
            <p className="truncate text-sm text-muted">{messagePreview(replyingTo)}</p>
          </div>
          <button
            onClick={onCancelReply}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover"
            aria-label="Cancel reply"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {showEmojis && (
        <div className="pt-2">
          {/* 😀 Emoji, 🌟 stickers and 🎞️ GIFs share one panel */}
          {canSendStickers && (
            <div className="flex gap-1 px-3 pb-1.5">
              {[
                ['emoji', '😀 Emoji'],
                ['stickers', '🌟 Stickers'],
                ...(hasGifs ? [['gifs', '🎞️ GIF']] : []),
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  // mousedown, not pointerdown: preventing the default here keeps
                  // the keyboard open on desktop without swallowing taps on phones
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setPanel(key)}
                  aria-pressed={panel === key}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    panel === key ? 'bg-brand-soft text-brand' : 'text-muted hover:bg-hover'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {panel === 'gifs' && canSendStickers && hasGifs ? (
            <GifPicker
              onPick={(file) => {
                setShowEmojis(false);
                onPickImage?.(file);
              }}
              onError={onError}
              onUnavailable={() => {
                setHasGifs(false);
                setPanel('emoji');
              }}
            />
          ) : panel === 'stickers' && canSendStickers ? (
            <div className="scroll-thin max-h-52 overflow-y-auto px-3">
              {/* 🌟 Packs I installed from the sticker packs screen */}
              <div className="flex items-center justify-between pt-1 pb-1">
                <p className="text-[11px] font-semibold text-muted">
                  {stickerPacks.length ? 'My packs' : 'Add packs made by other people'}
                </p>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onOpenStickerStore}
                  className="flex items-center gap-1 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-brand"
                >
                  <Plus size={13} /> Get stickers
                </button>
              </div>

              {stickerPacks.map((pack) => (
                <div key={pack._id}>
                  <p className="pt-1 pb-0.5 text-[11px] font-semibold text-muted">{pack.name}</p>
                  <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
                    {pack.stickers.map((sticker) => (
                      <button
                        key={sticker._id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setShowEmojis(false);
                          onSendCustomSticker(sticker.url);
                        }}
                        className="flex items-center justify-center rounded-xl p-1.5 transition hover:bg-hover active:scale-95"
                        aria-label={`Send sticker from ${pack.name}`}
                      >
                        <img src={sticker.url} alt="" className="h-16 w-16 object-contain" draggable={false} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {STICKER_PACKS.map((pack) => (
                <div key={pack.id}>
                  <p className="pt-1 pb-0.5 text-[11px] font-semibold text-muted">{pack.name}</p>
                  <div className="grid grid-cols-4 gap-1 sm:grid-cols-6">
                    {pack.stickers.map((sticker) => (
                      <button
                        key={sticker.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setShowEmojis(false);
                          onSendSticker(sticker.id);
                        }}
                        className="flex items-center justify-center rounded-xl p-1.5 transition hover:bg-hover active:scale-95"
                        aria-label={`Send sticker: ${sticker.label}`}
                        title={sticker.label}
                      >
                        <img src={stickerUrl(sticker.id)} alt="" className="h-16 w-16" draggable={false} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="scroll-thin grid max-h-48 grid-cols-8 gap-1 overflow-y-auto px-3 sm:grid-cols-12">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  // Keep the keyboard open on mobile
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertEmoji(emoji)}
                  className="flex h-10 items-center justify-center rounded-lg text-2xl hover:bg-hover"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isRecording && canRecordVoice ? (
        <VoiceRecorder
          onCancel={() => setIsRecording(false)}
          onError={onError}
          onSend={(recording) => {
            setIsRecording(false);
            onSendVoice(recording);
          }}
        />
      ) : (
        <div className="flex items-end gap-1 px-2 py-2 md:px-3">
          <button
            type="button"
            onClick={() => setShowEmojis(!showEmojis)}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition hover:bg-hover ${showEmojis ? 'text-brand' : 'text-muted'}`}
            aria-label="Emoji"
          >
            <Smile size={23} />
          </button>

          {/* A rich-text box, not a <textarea>: phone keyboards only offer their
              🎞️ GIF and sticker buttons for fields that can hold a picture.
              Everything typed is still handled as plain text. */}
          <div
            ref={boxRef}
            role="textbox"
            contentEditable
            suppressContentEditableWarning
            aria-multiline="true"
            aria-label={placeholder}
            data-placeholder={placeholder}
            data-empty={text ? undefined : 'true'}
            onInput={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBeforeInput={handleInsertedImage}
            onDrop={handleInsertedImage}
            onBlur={stopTyping}
            // text-base (16px) stops iOS from zooming into the field
            className="scroll-thin max-h-32 min-w-0 flex-1 overflow-y-auto rounded-3xl bg-panel-soft px-4 py-2.5 text-base leading-6 break-words whitespace-pre-wrap outline-none md:text-[15px]"
          />

          {!emojiOnly && onCamera && (
            <button
              type="button"
              onClick={onCamera}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-hover hover:text-fg"
              aria-label="Camera"
              title="📷 Tap for a photo, hold the button to record a video"
            >
              <Camera size={22} />
            </button>
          )}

          {showMic ? (
            <button
              type="button"
              onClick={() => {
                stopTyping();
                setShowEmojis(false);
                setIsRecording(true);
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-strong"
              aria-label="Record a voice message"
              title="🎤 Voice message"
            >
              <Mic size={21} />
            </button>
          ) : (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()} // don't close the mobile keyboard
              onClick={send}
              disabled={!canSend}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-strong disabled:opacity-40"
              aria-label="Send message"
            >
              <SendHorizontal size={20} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
