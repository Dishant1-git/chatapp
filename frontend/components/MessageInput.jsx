'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Mic, SendHorizontal, Smile, X } from 'lucide-react';
import { useChat } from './ChatProvider';
import VoiceRecorder from './VoiceRecorder';
import { messagePreview } from '@/lib/format';
import { isOnlyEmoji } from '@/lib/ghost';
import { canRecord } from '@/lib/recording';
import { STICKERS, stickerUrl } from '@/lib/stickers';

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

export default function MessageInput({
  conversationId,
  replyingTo,
  replyName,
  emojiOnly = false, // deep ghost: only emojis can be sent, no photos
  onCancelReply,
  onSendText,
  onCamera, // 📷 opens the camera (tap = photo, hold = video)
  onSendSticker, // 🌟 (id) sends a sticker
  onSendVoice, // 🎤 ({ blob, duration, waveform }) a recorded voice message
  onError,
}) {
  const { socket } = useChat();
  const [text, setText] = useState('');
  const [showEmojis, setShowEmojis] = useState(emojiOnly);
  const [panel, setPanel] = useState('emoji'); // emoji | stickers
  const [isRecording, setIsRecording] = useState(false);
  // Checked after mounting, since the server render has no MediaRecorder
  const [recordingSupported, setRecordingSupported] = useState(false);
  const textareaRef = useRef(null);
  const typing = useRef({ active: false, lastSent: 0, timer: null });
  const draftRef = useRef({ startedAt: 0, longest: 0 });
  const socketRef = useRef(socket);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => setRecordingSupported(canRecord()), []);

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

  // Grow the textarea with its content, up to about 5 lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [text]);

  // Focus the input when the user picks "Reply"
  useEffect(() => {
    if (replyingTo) textareaRef.current?.focus();
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
  const showMic = canRecordVoice && !trimmed;

  function handleChange(event) {
    const value = event.target.value;
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

  function insertEmoji(emoji) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    // Put the cursor right after the inserted emoji
    requestAnimationFrame(() => {
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  return (
    <div className="shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)]">
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
          {/* 😀 Emoji and 🌟 stickers share one panel */}
          {canSendStickers && (
            <div className="flex gap-1 px-3 pb-1.5">
              {[
                ['emoji', '😀 Emoji'],
                ['stickers', '🌟 Stickers'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
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

          {panel === 'stickers' && canSendStickers ? (
            <div className="scroll-thin grid max-h-52 grid-cols-4 gap-1 overflow-y-auto px-3 sm:grid-cols-6">
              {STICKERS.map((sticker) => (
                <button
                  key={sticker.id}
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
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
          ) : (
            <div className="scroll-thin grid max-h-48 grid-cols-8 gap-1 overflow-y-auto px-3 sm:grid-cols-12">
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  // Keep the keyboard open on mobile
                  onPointerDown={(e) => e.preventDefault()}
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

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={stopTyping}
            rows={1}
            maxLength={4000}
            placeholder={emojiOnly ? 'Emojis only' : 'Type a message'}
            // text-base (16px) stops iOS from zooming into the field
            className="scroll-thin max-h-32 min-w-0 flex-1 resize-none rounded-3xl bg-panel-soft px-4 py-2.5 text-base leading-6 outline-none placeholder:text-muted md:text-[15px]"
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
              onPointerDown={(e) => e.preventDefault()} // don't close the mobile keyboard
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
