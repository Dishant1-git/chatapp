'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, SendHorizontal } from 'lucide-react';
import { useChat } from './ChatProvider';
import { BooAvatar } from './Avatar';
import { api } from '@/lib/client';
import { BOO_NAME, loadBooChat, saveBooChat, setBoo, useBooOn } from '@/lib/boo';

const HELLO =
  "Boo! 👻 I'm the ghost who haunts Ghost-ed. Ask me how anything in here works — ghost levels, streaks, gifts, the lot. I also show up when someone ghosts you. For moral support. Mostly to laugh.";
const STARTERS = ['How does ghosting work?', 'What’s a 🔥 streak?', 'Are my chats private?', 'I got ghosted 😭'];
const MAX_LENGTH = 600; // the server's limit for one message to Boo
const TURNS_SENT = 12; // how much of the chat Boo is reminded of

// The chat with Boo (/chat/boo). Unlike every other chat it isn't a conversation
// on the server: what's typed goes to /api/boo/chat, and the history stays in
// this browser (lib/boo.js).
export default function BooChat() {
  const { user, goBackToList } = useChat();
  const on = useBooOn();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const listRef = useRef(null);

  useEffect(() => setMessages(loadBooChat(user._id)), [user._id]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, isThinking]);

  function keep(next) {
    setMessages(next);
    saveBooChat(user._id, next);
  }

  async function ask(question) {
    const trimmed = question.trim();
    if (!trimmed || isThinking) return;

    const asked = [...messages.filter((m) => !m.failed), { from: 'me', text: trimmed, at: Date.now() }];
    keep(asked);
    setText('');
    setIsThinking(true);
    try {
      const { reply } = await api('/api/boo/chat', {
        method: 'POST',
        body: {
          messages: asked
            .slice(-TURNS_SENT)
            .map((m) => ({ role: m.from === 'me' ? 'user' : 'assistant', content: m.text })),
        },
      });
      keep([...asked, { from: 'boo', text: reply, at: Date.now() }]);
    } catch (err) {
      // Shown, not kept: it's about this try, not part of the chat
      setMessages([...asked, { from: 'boo', text: `Eek 👻 ${err.message}`, at: Date.now(), failed: true }]);
    } finally {
      setIsThinking(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    ask(text);
  }

  return (
    <div className="mobile-slide-in relative flex h-full min-h-0 flex-1 flex-col bg-panel">
      <header className="brand-header flex h-[4.5rem] shrink-0 items-center gap-1 px-2 md:gap-2 md:px-4">
        <button
          onClick={goBackToList}
          className="flex h-10 w-9 shrink-0 items-center justify-center rounded-full text-fg hover:bg-hover md:hidden"
          aria-label="Back to chats"
        >
          <ArrowLeft size={22} />
        </button>
        <BooAvatar size={40} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate leading-tight font-semibold text-fg">{BOO_NAME}</h2>
          <p className="truncate text-xs text-brand">Resident ghost · always haunting</p>
        </div>
        {/* Stops Boo roaming the screen and popping up in other chats. Boo stays in the list either way. */}
        <button
          type="button"
          onClick={() => setBoo(!on)}
          aria-pressed={on}
          title={on ? 'Boo roams your screen and pops up when you’re ghosted. Tap to stop.' : 'Boo stays in here. Tap to let Boo out again.'}
          className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-xs font-medium text-fg transition hover:bg-hover"
        >
          Roaming {on ? 'on' : 'off'}
          <span className={`relative h-4 w-7 rounded-full transition ${on ? 'bg-brand' : 'bg-line'}`} aria-hidden>
            <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-panel transition-all ${on ? 'left-3.5' : 'left-0.5'}`} />
          </span>
        </button>
      </header>

      <div
        ref={listRef}
        className="chat-bg scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 pt-3 pb-4 text-fg md:px-[5%] lg:px-[8%]"
      >
        <p className="mx-auto max-w-md rounded-xl bg-panel-soft px-3 py-2 text-center text-xs text-muted">
          Boo only talks about Ghost-ed. What you write here goes to Boo’s AI and isn’t end-to-end encrypted — your
          chats with people still are, and Boo can’t read them.
        </p>

        <Bubble text={HELLO} />
        {messages.map((message, i) => (
          <Bubble key={`${message.at}-${i}`} text={message.text} isMine={message.from === 'me'} />
        ))}
        {isThinking && <Bubble text="Boo is thinking…" isQuiet />}

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {STARTERS.map((starter) => (
              <button
                key={starter}
                type="button"
                onClick={() => ask(starter)}
                className="rounded-full border border-line bg-panel px-3 py-1.5 text-sm transition hover:bg-hover"
              >
                {starter}
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-center gap-2 border-t border-line bg-panel px-3 py-2.5 pb-[max(0.625rem,var(--safe-bottom))] md:px-4"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_LENGTH}
          placeholder="Ask Boo about the app"
          aria-label="Message Boo"
          className="min-w-0 flex-1 rounded-full bg-panel-soft px-4 py-2.5 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-brand/25 md:text-sm"
        />
        <button
          type="submit"
          disabled={!text.trim() || isThinking}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand text-on-brand shadow-md transition hover:bg-brand-strong disabled:opacity-50"
          aria-label="Send message"
        >
          <SendHorizontal size={20} />
        </button>
      </form>
    </div>
  );
}

function Bubble({ text, isMine = false, isQuiet = false }) {
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <p
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-[15px] leading-snug break-words whitespace-pre-wrap md:max-w-[65%] ${
          isMine ? 'rounded-tr-md bg-bubble-out text-bubble-out-fg' : 'rounded-tl-md bg-bubble-in text-bubble-in-fg'
        } ${isQuiet ? 'text-muted italic' : ''}`}
      >
        {text}
      </p>
    </div>
  );
}
