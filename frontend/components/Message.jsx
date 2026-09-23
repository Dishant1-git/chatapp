'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  AlertCircle,
  Ban,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  Lock,
  Reply,
  RotateCw,
  Trash2,
  Volume2,
} from 'lucide-react';
import { speak } from '@/lib/accessibility';
import { REACTIONS } from '@/lib/reactions';
import { formatTime, messagePreview } from '@/lib/format';
import { colorFor } from './Avatar';
import SecureImage, { useMessageImage } from './SecureImage';
import { VideoNote, VoiceNote } from './MediaNote';
import { isSticker, stickerLabel, stickerUrl } from '@/lib/stickers';

// ✓ sent · ✓✓ delivered · blue ✓✓ read
export function MessageTicks({ message, className = '' }) {
  if (message.failed) return <AlertCircle size={15} className={`text-red-500 ${className}`} />;
  if (message.pending) return <Clock3 size={13} className={className} />;
  if (message.isRead) return <CheckCheck size={16} className={`text-tick-read ${className}`} />;
  if (message.isDelivered) return <CheckCheck size={16} className={className} />;
  return <Check size={16} className={className} />;
}

// Turns URLs in a message into clickable links
function Linkified({ text }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="text-tick-read underline underline-offset-2"
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}

function Message({
  message,
  isMine,
  isGrouped,
  myId,
  nameOf,
  showSender,
  registerRef,
  onReply,
  onReact,
  onDelete,
  onRetry,
  onJumpTo,
  onOpenImage,
  onImageLoad,
  // Sent to me by someone I'm ghosting: shown as "👻 Ghosted" until I peek
  ghostedView = false,
  // I'm the one who can answer this forgiveness request
  canAnswerForgiveness = false,
  onForgivenessAnswer,
  onReveal,
  onOpenGhostClick,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuOpensUp, setMenuOpensUp] = useState(false);
  const [peek, setPeek] = useState(false);
  const [anonymousMode, setAnonymousMode] = useState(false);
  const [askLater, setAskLater] = useState(false);
  const [bursts, setBursts] = useState([]); // ✨ emojis flying up after a new reaction
  const bubbleRef = useRef(null);
  const menuRef = useRef(null);
  const longPressTimer = useRef(null);
  const previousReactions = useRef(null);
  const reduceMotion = useReducedMotion();

  const { replyTo, reactions = [], isDeleted, undecryptable } = message;
  // 👻 Ghost Click: a view-once photo (and its caption) is only shown in the viewer
  const ghostClick = message.ghostClick;
  const isViewOnce = ghostClick?.mode === 'once';
  const hasImage = Boolean(message.image) && !isDeleted && !undecryptable && !isViewOnce;
  const hasText = Boolean(message.text) && !isDeleted && !isViewOnce;
  const imageView = useMessageImage(hasImage ? message : null);
  const imageOnly = hasImage && !hasText;
  // 🎤 Voice message or 📹 video (a view-once one is only shown in the viewer)
  const hasMedia = Boolean(message.media) && !isDeleted && !undecryptable && !isViewOnce;
  const isVoiceNote = hasMedia && message.messageType === 'audio';
  // A video note is a circle on its own, without a bubble around it
  const isVideoNote = hasMedia && message.messageType === 'video';
  // 🌟 A sticker is shown on its own, without a bubble
  const showSticker = Boolean(message.sticker) && isSticker(message.sticker) && !isDeleted && !undecryptable;
  // Nothing at all to show: the recording never made it to the server
  const isEmpty =
    !hasText && !hasImage && !hasMedia && !isViewOnce && !showSticker && !isDeleted && !undecryptable && !message.forgiveness;

  // ✨ When a new reaction shows up (mine or someone else's), its emoji bursts up
  useEffect(() => {
    const key = (r) => `${r.userId}:${r.emoji}`;
    const before = previousReactions.current;
    previousReactions.current = new Set(reactions.map(key));
    if (!before || reduceMotion) return; // not on first render
    const added = reactions.filter((r) => r.emoji && !before.has(key(r)));
    if (added.length) {
      setBursts((prev) => [...prev, ...added.map((r) => ({ id: `${key(r)}:${Date.now()}`, emoji: r.emoji }))]);
    }
  }, [reactions, reduceMotion]);

  function openMenu() {
    if (message.pending) return;
    // Open upwards when the bubble is near the bottom of the screen
    const rect = bubbleRef.current.getBoundingClientRect();
    setMenuOpensUp(rect.bottom > window.innerHeight - 330);
    setIsMenuOpen(true);
  }

  // Close the menu when tapping anywhere else
  useEffect(() => {
    if (!isMenuOpen) return;
    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setIsMenuOpen(false);
    }
    function handleKey(event) {
      if (event.key === 'Escape') setIsMenuOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isMenuOpen]);

  // Long press on touch screens opens the menu (like WhatsApp)
  function handleTouchStart() {
    longPressTimer.current = setTimeout(() => {
      navigator.vibrate?.(10);
      openMenu();
    }, 450);
  }
  function cancelLongPress() {
    clearTimeout(longPressTimer.current);
  }

  function runAndClose(action) {
    setIsMenuOpen(false);
    action();
  }

  // Group reactions: { '❤️': 2, '👍': 1 }. Anonymous ones I can't see are grouped as 👀.
  const reactionCounts = {};
  reactions.forEach((r) => {
    const key = r.emoji || '👀';
    reactionCounts[key] = (reactionCounts[key] || 0) + 1;
  });
  const mine = reactions.find((r) => String(r.userId) === myId);
  const myReaction = mine?.emoji;
  const hasReactions = reactions.length > 0;

  function clickReaction(emoji) {
    if (emoji === '👀') return onReveal(message);
    // Tapping my own reaction removes it (it has to match, anonymous or not)
    onReact(message, emoji, emoji === myReaction ? Boolean(mine?.anonymous) : false);
  }

  // 👻 Ghosted: collapsed until I choose to peek
  if (ghostedView && !peek) {
    return (
      <div ref={(el) => registerRef(message._id, el)} className={`flex justify-start ${isGrouped ? 'mt-0.5' : 'mt-2.5'}`}>
        <button
          type="button"
          onClick={() => setPeek(true)}
          className="rounded-2xl rounded-tl-md border border-dashed border-line bg-bubble-in/70 px-3 py-1.5 text-[14px] text-muted italic"
          title="Tap to peek"
        >
          👻 Ghosted <span className="text-[11px] not-italic opacity-70">· {formatTime(message.createdAt)} · tap to peek</span>
        </button>
      </div>
    );
  }

  const request = message.forgiveness;

  const time = (
    <>
      {formatTime(message.createdAt)}
      {isMine && !isDeleted && <MessageTicks message={message} />}
    </>
  );

  return (
    <div
      ref={(el) => registerRef(message._id, el)}
      className={`flex rounded-lg ${isMine ? 'justify-end' : 'justify-start'} ${isGrouped ? 'mt-0.5' : 'mt-2.5'} ${hasReactions ? 'mb-4' : ''}`}
    >
      <div className="group relative max-w-[85%] md:max-w-[65%]">
        <div
          ref={bubbleRef}
          onContextMenu={(e) => {
            e.preventDefault();
            openMenu();
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={cancelLongPress}
          onTouchMove={cancelLongPress}
          className={`relative rounded-2xl select-none [-webkit-touch-callout:none] md:select-text ${
            isVideoNote || showSticker ? '' : `shadow-[0_1px_1px_rgba(0,0,0,0.08)] ${isMine ? 'bg-bubble-out' : 'bg-bubble-in'}`
          } ${isGrouped ? '' : isMine ? 'rounded-tr-md' : 'rounded-tl-md'} ${isVideoNote || showSticker ? '' : imageOnly ? 'p-1' : 'px-2.5 py-1.5'} ${
            message.pending ? 'opacity-80' : ''
          } ${request ? 'border border-sky-400/40' : ''}`}
        >
          {request && (
            <p className="mb-0.5 text-[12px] font-semibold tracking-wide text-sky-600 uppercase dark:text-sky-400">
              🕊️ Forgiveness request
            </p>
          )}
          {/* Group chats: who wrote it */}
          {showSender && (
            <p
              className={`truncate text-[13px] font-semibold ${imageOnly ? 'px-1.5 pt-0.5 pb-1' : ''}`}
              style={{ color: colorFor(nameOf(message.senderId)) }}
            >
              {nameOf(message.senderId)}
            </p>
          )}

          {/* Quoted message this one replies to */}
          {replyTo && !isDeleted && (
            <button
              type="button"
              onClick={() => onJumpTo(replyTo._id)}
              className={`mb-1 flex w-full min-w-40 items-center gap-2 overflow-hidden rounded-lg border-l-4 border-brand bg-black/5 text-left dark:bg-white/5 ${imageOnly ? '' : '-mx-0.5'}`}
            >
              <span className="min-w-0 flex-1 px-2.5 py-1.5">
                <span className="block text-xs font-semibold text-brand">
                  {nameOf(replyTo.senderId)}
                </span>
                <span className="line-clamp-2 text-[13px] text-muted">{messagePreview(replyTo, { nameOf, myId })}</span>
              </span>
              {replyTo.image && !replyTo.isDeleted && !replyTo.undecryptable && (
                <SecureImage message={replyTo} alt="" className="h-12 w-12 shrink-0 object-cover" />
              )}
            </button>
          )}

          {hasImage && (
            <button
              type="button"
              onClick={() => {
                if (message.pending || !imageView.src) return;
                // A savable Ghost Click opens in the Ghost Click viewer, with a Save button
                if (ghostClick) onOpenGhostClick(message);
                else onOpenImage(imageView.src);
              }}
              className="relative block overflow-hidden rounded-xl"
            >
              <SecureImage
                message={message}
                onLoad={onImageLoad}
                className="max-h-80 w-full min-w-40 bg-black/5 object-cover sm:w-72"
              />
              {ghostClick && (
                <span className="absolute top-1.5 left-1.5 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white">
                  👻 Ghost Click
                </span>
              )}
              {imageOnly && (
                <span className="absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white">
                  {time}
                </span>
              )}
            </button>
          )}

          {showSticker && (
            <img
              src={stickerUrl(message.sticker)}
              alt={`Sticker: ${stickerLabel(message.sticker)}`}
              draggable={false}
              className="h-32 w-32 select-none sm:h-36 sm:w-36"
            />
          )}

          {isVoiceNote && <VoiceNote message={message} isMine={isMine} />}
          {isVideoNote && <VideoNote message={message} time={time} />}

          {/* 👻 View-once Ghost Click: tap to open it, one time */}
          {isViewOnce && !isDeleted && (
            <GhostClickCard message={message} isMine={isMine} myId={myId} onOpen={() => onOpenGhostClick(message)} />
          )}

          {isDeleted && (
            <p className="flex items-center gap-1.5 pr-14 text-[14px] text-muted italic">
              <Ban size={14} /> This message was deleted
            </p>
          )}

          {/* An empty bubble would look like a bug, so say what's missing */}
          {isEmpty && (
            <p className="flex items-center gap-1.5 pr-14 text-[14px] text-muted italic">
              <AlertCircle size={14} />
              {/* mediaKind comes from the encrypted message, so it's known even
                  when the recording itself never made it to the server */}
              {(message.mediaKind || message.messageType) === 'audio'
                ? 'Voice message unavailable'
                : (message.mediaKind || message.messageType) === 'video'
                  ? 'Video message unavailable'
                  : 'This message is empty'}
            </p>
          )}

          {undecryptable && !isDeleted && (
            <p
              className="flex items-center gap-1.5 pr-14 text-[14px] text-muted italic"
              title="It was encrypted for an older key of yours, or before you joined."
            >
              <Lock size={14} /> This message can't be decrypted
            </p>
          )}

          {hasText && (
            <p className={`text-[15px] leading-snug break-words whitespace-pre-wrap ${hasImage ? 'px-1.5 pt-1' : ''}`}>
              <Linkified text={message.text} />
              {/* Spacer so the time never overlaps the last line of text */}
              <span className={`inline-block ${isMine ? 'w-[4.6rem]' : 'w-12'}`} />
            </p>
          )}

          {showSticker && (
            <span className={`flex items-center gap-1 pt-0.5 text-[11px] text-muted ${isMine ? 'justify-end' : ''}`}>
              {time}
            </span>
          )}

          {!imageOnly && !isVideoNote && !showSticker && (
            <span className="absolute right-2.5 bottom-1 flex items-center gap-1 text-[11px] text-muted">
              {time}
            </span>
          )}

          {/* Desktop: small arrow that opens the menu on hover */}
          {!message.pending && (
            <button
              type="button"
              onClick={openMenu}
              className="absolute top-1 right-1 hidden h-6 w-6 items-center justify-center rounded-full bg-inherit text-muted opacity-0 shadow-sm transition group-hover:opacity-100 focus:opacity-100 md:flex"
              aria-label="Message options"
            >
              <ChevronDown size={16} />
            </button>
          )}
        </div>

        {message.failed && (
          <button
            type="button"
            onClick={() => onRetry(message)}
            className="mt-1 flex items-center gap-1 text-xs text-red-600 dark:text-red-400"
          >
            <RotateCw size={12} /> Not sent. Tap to retry
          </button>
        )}

        {/* The answer to a forgiveness request, or the buttons to give one */}
        {request && !message.pending && (
          <div className={`mt-1 flex flex-wrap items-center gap-1.5 text-xs ${isMine ? 'justify-end' : ''}`}>
            {request.status === 'forgiven' && <span className="font-medium text-sky-600 dark:text-sky-400">🕊️ Forgiven</span>}
            {request.status === 'declined' && <span className="text-muted">👻 Still ghosted</span>}
            {request.status === 'pending' && !canAnswerForgiveness && <span className="text-muted">Waiting for an answer…</span>}
            {request.status === 'pending' && canAnswerForgiveness && askLater && (
              <button type="button" onClick={() => setAskLater(false)} className="text-muted hover:underline">
                ⏳ Asked to wait · answer now
              </button>
            )}
            {request.status === 'pending' && canAnswerForgiveness && !askLater && (
              <>
                <button
                  type="button"
                  onClick={() => onForgivenessAnswer(message, 'forgive')}
                  className="rounded-full bg-sky-500 px-3 py-1 font-medium text-white hover:bg-sky-600"
                >
                  🕊️ Forgive
                </button>
                <button
                  type="button"
                  onClick={() => onForgivenessAnswer(message, 'keep')}
                  className="rounded-full border border-line bg-panel px-3 py-1 font-medium hover:bg-hover"
                >
                  👻 Keep ghosting
                </button>
                <button
                  type="button"
                  onClick={() => setAskLater(true)}
                  className="rounded-full border border-line bg-panel px-3 py-1 font-medium hover:bg-hover"
                >
                  ⏳ Ask me later
                </button>
              </>
            )}
          </div>
        )}

        {/* 🪄 Message evolution: the sender later forgave the other person */}
        {message.badge === 'growth' && (
          <p className={`mt-1 text-[11px] font-medium text-sky-600 dark:text-sky-400 ${isMine ? 'text-right' : ''}`}>
            🕊️ Character development
          </p>
        )}

        {/* ✨ A new reaction's emoji floats up from the bubble */}
        <AnimatePresence>
          {bursts.map((burst, i) => (
            <motion.span
              key={burst.id}
              aria-hidden
              className={`pointer-events-none absolute bottom-0 z-20 text-2xl ${isMine ? 'right-6' : 'left-6'}`}
              initial={{ y: 0, scale: 0.4, opacity: 0 }}
              animate={{ y: -70, x: (i % 2 ? 1 : -1) * 14, scale: [0.4, 1.6, 1.2], opacity: [0, 1, 0] }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
              onAnimationComplete={() => setBursts((prev) => prev.filter((b) => b.id !== burst.id))}
            >
              {burst.emoji}
            </motion.span>
          ))}
        </AnimatePresence>

        {hasReactions && (
          <div className={`absolute -bottom-4 flex gap-1 ${isMine ? 'right-2' : 'left-2'}`}>
            {Object.entries(reactionCounts).map(([emoji, count]) => (
              <motion.button
                key={emoji}
                type="button"
                layout
                // Pops in when it first appears…
                initial={reduceMotion ? false : { scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                onClick={() => clickReaction(emoji)}
                className={`flex h-6 items-center gap-0.5 rounded-full border px-1.5 text-xs shadow-sm transition-colors ${
                  myReaction === emoji
                    ? 'border-brand/40 bg-brand-soft'
                    : 'border-line bg-panel hover:bg-hover'
                }`}
                title={
                  emoji === '👀'
                    ? 'Someone reacted anonymously — tap to reveal'
                    : myReaction === emoji
                      ? mine?.anonymous
                        ? 'Your anonymous reaction (only you see the emoji) — tap to remove'
                        : 'Remove your reaction'
                      : 'React'
                }
              >
                {/* …and bounces whenever its count changes */}
                <motion.span
                  key={count}
                  initial={reduceMotion ? false : { scale: 1.5 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 15 }}
                >
                  {emoji}
                </motion.span>
                {count > 1 && <span className="text-muted">{count}</span>}
              </motion.button>
            ))}
          </div>
        )}

        {isMenuOpen && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.12 }}
            className={`absolute z-30 w-60 overflow-hidden rounded-2xl border border-line bg-panel shadow-xl ${
              menuOpensUp ? 'bottom-full mb-1 origin-bottom' : 'top-full mt-1 origin-top'
            } ${isMine ? 'right-0' : 'left-0'}`}
          >
            {!isDeleted && !undecryptable && !message.failed && (
              <div className="border-b border-line px-2 py-2">
                <div className="flex justify-between">
                  {REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => runAndClose(() => onReact(message, emoji, anonymousMode))}
                      className={`flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:scale-110 hover:bg-hover ${
                        myReaction === emoji ? 'bg-brand-soft' : ''
                      }`}
                      aria-label={`React with ${emoji}${anonymousMode ? ' anonymously' : ''}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                {/* 🫣 Anonymous: they'll see 👀 and have to reveal which emoji it was */}
                <button
                  type="button"
                  onClick={() => setAnonymousMode(!anonymousMode)}
                  aria-pressed={anonymousMode}
                  className={`mt-1.5 w-full rounded-full px-2 py-1 text-xs transition ${
                    anonymousMode ? 'bg-brand-soft font-medium text-brand' : 'text-muted hover:bg-hover'
                  }`}
                >
                  🫣 {anonymousMode ? 'Anonymous reaction on' : 'React anonymously'}
                </button>
              </div>
            )}

            <div className="py-1 text-sm">
              {/* A view-once Ghost Click can't be quoted (the quote would show the photo) */}
              {!isDeleted && !undecryptable && !message.failed && !isViewOnce && (
                <MenuItem icon={Reply} label="Reply" onClick={() => runAndClose(() => onReply(message))} />
              )}
              {hasText && (
                <MenuItem
                  icon={Copy}
                  label="Copy text"
                  onClick={() => runAndClose(() => navigator.clipboard?.writeText(message.text))}
                />
              )}
              {/* ♿ Read the message out loud with the browser's voice */}
              {hasText && (
                <MenuItem
                  icon={Volume2}
                  label="Read aloud"
                  onClick={() => runAndClose(() => speak(`${nameOf(message.senderId)} said: ${message.text}`))}
                />
              )}
              {/* 💾 A savable Ghost Click video opens full screen, where it can be saved */}
              {isVideoNote && ghostClick?.mode === 'keep' && (
                <MenuItem icon={Download} label="Save video" onClick={() => runAndClose(() => onOpenGhostClick(message))} />
              )}
              {message.failed && (
                <MenuItem icon={RotateCw} label="Retry" onClick={() => runAndClose(() => onRetry(message))} />
              )}
              <MenuItem
                icon={Trash2}
                label="Delete"
                danger
                onClick={() => runAndClose(() => onDelete(message))}
              />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// 👻 The bubble for a view-once Ghost Click
function GhostClickCard({ message, isMine, myId, onOpen }) {
  const { openedBy = [], expired } = message.ghostClick;
  const openedByMe = openedBy.some((id) => String(id) === myId);
  const openedByAll = (message.recipients || []).length > 0 && message.recipients.every((id) => openedBy.some((o) => String(o) === String(id)));

  if (isMine) {
    return (
      <p className="flex items-center gap-2 pr-16 text-[14px]">
        <span className="text-lg">👻</span>
        <span>
          <span className="font-medium">Ghost Click</span>
          <span className="block text-[12px] text-muted">
            {message.pending ? 'Sending…' : openedByAll || expired ? 'Opened' : 'View once · not opened yet'}
          </span>
        </span>
      </p>
    );
  }

  if (openedByMe || expired || !(message.image || message.media)) {
    return (
      <p className="flex items-center gap-2 pr-12 text-[14px] text-muted italic">
        <span className="text-lg not-italic opacity-60">👻</span> Opened
      </p>
    );
  }

  return (
    <button type="button" onClick={onOpen} className="flex items-center gap-2 pr-12 text-left text-[14px]">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand text-lg text-white">👻</span>
      <span>
        <span className="block font-semibold text-brand">Tap to view</span>
        <span className="block text-[12px] text-muted">Ghost Click · view once</span>
      </span>
    </button>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-hover ${
        danger ? 'text-red-600 dark:text-red-400' : ''
      }`}
    >
      <Icon size={17} /> {label}
    </button>
  );
}

// memo: typing in the input or receiving a message doesn't re-render every bubble
export default memo(Message);
