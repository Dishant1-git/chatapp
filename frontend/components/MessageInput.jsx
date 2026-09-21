'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, SendHorizontal, Smile, X } from 'lucide-react';
import { useChat } from './ChatProvider';
import { checkImageFile } from './ImagePreview';
import { messagePreview } from '@/lib/format';

const EMOJIS = [
  '😀', '😂', '🤣', '😊', '😍', '🥰', '😘', '😎', '🤔', '😅', '😉', '🙂',
  '😢', '😭', '😡', '😮', '😴', '🤗', '🙄', '😬', '🥳', '😇', '🤩', '😤',
  '👍', '👎', '👏', '🙌', '🙏', '💪', '👋', '🤝', '❤️', '💔', '🔥', '✨',
  '🎉', '💯', '✅', '❌', '👀', '🤞', '☕', '🍕', '⚽', '🎂', '🌟', '😺',
];

const TYPING_REPEAT_MS = 3000; // re-send "typing" at most every 3s while typing
const TYPING_IDLE_MS = 2000; // send "stopTyping" after 2s without a keystroke

export default function MessageInput({
  conversationId,
  replyingTo,
  replyName,
  onCancelReply,
  onSendText,
  onPickImage,
  onError,
}) {
  const { socket } = useChat();
  const [text, setText] = useState('');
  const [showEmojis, setShowEmojis] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const typing = useRef({ active: false, lastSent: 0, timer: null });
  const socketRef = useRef(socket);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

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

  function handleChange(event) {
    setText(event.target.value);
    if (event.target.value.trim()) notifyTyping();
    else stopTyping();
  }

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setText('');
    setShowEmojis(false);
    stopTyping();
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

  function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow picking the same file again later
    if (!file) return;

    const problem = checkImageFile(file);
    if (problem) return onError(problem);
    onPickImage(file);
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
        <div className="scroll-thin grid max-h-48 grid-cols-8 gap-1 overflow-y-auto px-3 pt-2 sm:grid-cols-12">
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
          placeholder="Type a message"
          // text-base (16px) stops iOS from zooming into the field
          className="scroll-thin max-h-32 min-w-0 flex-1 resize-none rounded-3xl bg-panel-soft px-4 py-2.5 text-base leading-6 outline-none placeholder:text-muted md:text-[15px]"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-hover hover:text-fg"
          aria-label="Send a photo"
        >
          <ImagePlus size={22} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFile}
          className="hidden"
        />

        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()} // don't close the mobile keyboard
          onClick={send}
          disabled={!text.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-white transition hover:bg-brand-strong disabled:opacity-40"
          aria-label="Send message"
        >
          <SendHorizontal size={20} />
        </button>
      </div>
    </div>
  );
}
