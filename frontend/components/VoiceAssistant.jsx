'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mic, X } from 'lucide-react';
import { useChat } from './ChatProvider';
import { useCalls } from './CallProvider';
import { api } from '@/lib/client';
import { conversationTitle } from '@/lib/conversations';
import { canForwardTo } from '@/lib/forward';
import { playListeningSound, unlockAudio } from '@/lib/sounds';
import { afterWakeWords, findChat, isNo, isYes, sendTextTo, setVoice, useVoiceOn, voiceSupported } from '@/lib/voice';

const COMMAND_WINDOW_MS = 8000; // how long "Hey Boo" waits for the command
const CONFIRM_WINDOW_MS = 15000; // how long a "send it?" waits for yes or no
const CALL_COUNTDOWN_MS = 4500; // time to say "cancel" before a call goes out
const SILENCE_MS = 3000; // this long without a word means the command is finished
const UNDERSTAND_TIMEOUT_MS = 12000; // how long the server gets to work out a command
// What's been said of the command so far, without the wake words and without
// a lone "yes" or "okay" (people answer the blip)
function commandIn({ parts, interim }) {
  const said = [...parts, interim].join(' ').replace(/\s+/g, ' ').trim();
  const command = (afterWakeWords(said) ?? said).trim();
  return /^(?:yes|yeah|yep|ok|okay|hello|hi|hey)[.!?]*$/i.test(command) ? '' : command;
}

const HINT = 'Say “Hey Boo”, then “call Harinder” or “tell Simran I’m on my way”.';

// 🎙️ Hands-free voice commands. While it's switched on (the microphone button
// above the chat list) the app listens for "Hey Boo" and then does what it's
// told: call or video call someone, send them a message, open their chat.
//
// It answers out loud, so the screen never has to be looked at or touched:
//  - a call is announced and goes out after a few seconds unless "cancel" is said;
//  - a message is read back first and only sent after a "yes" — a misheard
//    name or sentence can't be unsent, so that one is always asked.
//
// Listening stops during a call (the microphone is busy, and a conversation
// isn't a list of commands) and whenever the app isn't in front. A browser can
// only listen while its page is open: this can't hear anything with the phone
// locked or the app closed.
export default function VoiceAssistant() {
  const on = useVoiceOn();
  const { user, conversations } = useChat();
  const { currentCall, startCall } = useCalls();
  const router = useRouter();

  const [phase, setPhase] = useState('idle'); // idle | command | thinking | confirm | reply
  const [heard, setHeard] = useState(''); // what's being said right now
  const [line, setLine] = useState(''); // what the assistant last said
  const [pending, setPending] = useState(null); // { kind: 'message' | 'call', conversation, text?, video? }
  // ⌨️ The same commands can be typed: for a noisy room, a browser that mishears,
  // or just to check that a command does what it should
  const [isOpen, setIsOpen] = useState(false);
  const [typed, setTyped] = useState('');

  // The recogniser's callbacks outlive renders, so they read everything from refs
  const phaseRef = useRef('idle');
  const pendingRef = useRef(null);
  const speakingRef = useRef(false);
  const timer = useRef(null);
  const latest = useRef({});
  latest.current = { conversations, myId: user?._id, startCall, router };

  // The command while it's still being spoken: a recogniser hands a sentence over
  // in pieces, one at every breath. `parts` are the finished pieces, `interim`
  // the one still being said.
  const spoken = useRef({ parts: [], interim: '', silence: null });

  const go = useCallback((next, waiting = null) => {
    clearTimeout(timer.current);
    clearTimeout(spoken.current.silence);
    spoken.current = { parts: [], interim: '', silence: null };
    phaseRef.current = next;
    pendingRef.current = waiting;
    setPhase(next);
    setPending(waiting);
  }, []);

  // Says it out loud and shows it. Nothing heard while it's talking counts —
  // otherwise it would take orders from its own voice.
  // It always resolves, voice or no voice: what it's doing must never wait on
  // a browser that can't (or won't) speak.
  const say = useCallback((words) => {
    const text = String(words || '');
    setLine(text);
    return new Promise((resolve) => {
      if (!text || !window.speechSynthesis) return resolve();
      speakingRef.current = true;
      let finished = false;
      let giveUp;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(giveUp);
        // A beat longer: the recogniser delivers the tail of it a moment late
        setTimeout(() => {
          speakingRef.current = false;
          resolve();
        }, 350);
      };
      // Some browsers never fire "end" — phones especially
      giveUp = setTimeout(done, 1200 + text.length * 75);
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = done;
        utterance.onerror = done;
        window.speechSynthesis.speak(utterance);
      } catch {
        done();
      }
    });
  }, []);

  const backToIdle = useCallback(() => go('idle'), [go]);

  // The answer to a command that's over: shown (and said), then back to listening
  const reply = useCallback(
    async (text) => {
      go('reply');
      await say(text);
      if (phaseRef.current === 'reply') backToIdle();
    },
    [go, say, backToIdle]
  );

  const placeCall = useCallback(
    async ({ conversation, video }) => {
      backToIdle();
      window.speechSynthesis?.cancel();
      try {
        await latest.current.startCall(conversation._id, video);
      } catch (err) {
        reply(`I couldn’t start the call. ${err.message}`);
      }
    },
    [backToIdle, reply]
  );

  const sendPending = useCallback(
    async ({ conversation, text }) => {
      go('thinking');
      try {
        await sendTextTo(conversation, text);
        reply('Sent.');
      } catch (err) {
        reply(`It didn’t send. ${err.message}`);
      }
    },
    [go, reply]
  );

  const cancelPending = useCallback(() => reply('Okay, cancelled.'), [reply]);

  const run = useCallback(
    async (command) => {
      go('thinking');
      setHeard(command);
      try {
        const result = await Promise.race([
          api('/api/assistant/command', { method: 'POST', body: { text: command } }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('The server took too long. Try again.')), UNDERSTAND_TIMEOUT_MS)
          ),
        ]);
        if (phaseRef.current !== 'thinking') return; // switched off meanwhile
        if (!result?.action || result.action === 'none') {
          return reply(`I heard “${command}”. ${result?.say || 'I can call, video call, message or open a chat.'}`);
        }

        const { conversations: chats, myId, router: nav } = latest.current;
        const found = findChat(chats, result.name);
        if (found.several) return reply(`I found ${found.several.join(' and ')}. Say it again with the full name.`);
        if (!found.conversation) return reply(`I couldn’t find “${result.name}” in your chats.`);
        const conversation = found.conversation;
        const who = conversationTitle(conversation);

        if (result.action === 'open') {
          nav.push(`/chat/${conversation._id}`);
          return reply(`Opening ${who}.`);
        }

        if (!canForwardTo(conversation, myId)) return reply(`You can’t reach ${who} right now.`);

        if (result.action === 'message') {
          const waiting = { kind: 'message', conversation, text: result.text };
          go('confirm', waiting);
          await say(`To ${who}: ${result.text}. Say yes to send, or no to cancel.`);
          if (pendingRef.current !== waiting) return; // answered by a tap meanwhile
          timer.current = setTimeout(() => {
            if (pendingRef.current === waiting) cancelPending();
          }, CONFIRM_WINDOW_MS);
          return;
        }

        // A call: announced, then placed unless it's called off in time. The
        // countdown doesn't wait for the announcement to finish being spoken.
        const video = result.action === 'video_call';
        const waiting = { kind: 'call', conversation, video };
        go('confirm', waiting);
        say(`${video ? 'Video calling' : 'Calling'} ${who}. Say cancel to stop.`);
        timer.current = setTimeout(() => {
          if (pendingRef.current === waiting) placeCall(waiting);
        }, CALL_COUNTDOWN_MS);
      } catch (err) {
        // Whatever went wrong, say so — never sit on "Working on it…"
        reply(err?.message || 'Something went wrong. Try again.');
      }
    },
    [go, say, reply, cancelPending, placeCall]
  );

  // A piece of the command, finished or still being said. Nothing is done with
  // it until they've stopped talking for a moment — acting on the first piece
  // is how "message Harinder… saying I'm late" used to lose its second half.
  const gather = useCallback(
    (piece, isFinal) => {
      const buffer = spoken.current;
      if (!isFinal) buffer.interim = piece;
      else {
        buffer.interim = '';
        // Some phones repeat everything said so far with each piece
        const last = buffer.parts.at(-1);
        if (last && piece.toLowerCase().startsWith(last.toLowerCase())) buffer.parts[buffer.parts.length - 1] = piece;
        else if (piece) buffer.parts.push(piece);
      }

      const soFar = commandIn(buffer);
      setHeard(soFar);
      clearTimeout(buffer.silence);
      if (!soFar) return; // only "hey boo" so far: still waiting for the rest
      clearTimeout(timer.current);
      buffer.silence = setTimeout(() => {
        const command = commandIn(buffer);
        if (phaseRef.current === 'command' && command) run(command);
      }, SILENCE_MS);
    },
    [run]
  );
  const gatherRef = useRef(gather);
  gatherRef.current = gather;

  // One finished sentence from the recogniser, outside of a command being dictated
  const handleHeard = useCallback(
    (sentence) => {
      if (speakingRef.current || !sentence) return;
      const phaseNow = phaseRef.current;

      if (phaseNow === 'confirm') {
        const waiting = pendingRef.current;
        if (!waiting) return;
        if (isNo(sentence)) return cancelPending();
        if (waiting.kind === 'message' && isYes(sentence)) return sendPending(waiting);
        return;
      }
      if (phaseNow !== 'idle') return;

      const start = afterWakeWords(sentence);
      if (start === null) return; // not for us — and it goes nowhere
      // The wake words: from here on everything is gathered into the command
      // (see gather) until they stop talking. A blip instead of a spoken
      // "yes?" — while it talks it can't listen, and people don't wait for it.
      go('command');
      setLine('');
      timer.current = setTimeout(() => phaseRef.current === 'command' && backToIdle(), COMMAND_WINDOW_MS);
      if (start) gather(start, true);
      else playListeningSound();
    },
    [go, gather, backToIdle, cancelPending, sendPending]
  );
  const handleHeardRef = useRef(handleHeard);
  handleHeardRef.current = handleHeard;

  // The microphone: on while the switch is on, the app is in front and no call is running
  const inCall = Boolean(currentCall);
  useEffect(() => {
    if (!on || inCall || !voiceSupported()) return;

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || 'en-US';
    let wanted = true;
    let restart;

    const start = () => {
      if (!wanted || document.hidden) return;
      try {
        recognition.start();
      } catch {
        // Already started
      }
    };
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const said = event.results[i][0].transcript.trim();
        const isFinal = event.results[i].isFinal;
        if (speakingRef.current) continue;
        // A command being dictated is followed word by word; anything else
        // only counts once the sentence is finished — and what's said around
        // the phone the rest of the time is never put on screen
        if (phaseRef.current === 'command') gatherRef.current(said, isFinal);
        else if (isFinal) handleHeardRef.current(said);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        wanted = false;
        setVoice(false);
        setLine('The microphone is blocked for this site. Allow it in the browser’s settings, then switch me on again.');
      }
    };
    // Browsers end a session after a pause (phones after every sentence)
    recognition.onend = () => {
      if (wanted) restart = setTimeout(start, 200);
    };
    const onVisibility = () => (document.hidden ? recognition.abort() : start());
    document.addEventListener('visibilitychange', onVisibility);
    start();

    return () => {
      wanted = false;
      clearTimeout(restart);
      document.removeEventListener('visibilitychange', onVisibility);
      recognition.onend = null;
      recognition.abort();
    };
  }, [on, inCall]);

  // A call began: drop whatever was half done
  useEffect(() => {
    if (!inCall) return;
    go('idle');
    setHeard('');
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
  }, [inCall, go]);

  // Switched off (the layout only mounts this while it's on)
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(spoken.current.silence);
      window.speechSynthesis?.cancel();
    },
    []
  );

  // Just switched on: say how it works. And once things go quiet again, what
  // was last said is cleared, leaving only the small "listening" chip.
  useEffect(() => {
    if (!on) return;
    setLine(HINT);
    unlockAudio(); // for the "I'm listening" blip
  }, [on]);
  useEffect(() => {
    if (phase !== 'idle' || !line) return;
    const clear = setTimeout(() => setLine(''), 7000);
    return () => clearTimeout(clear);
  }, [phase, line]);

  if (!on || inCall) return null;

  const status = { thinking: 'Working on it…', command: 'Listening…', idle: 'Listening for “Hey Boo”' }[phase] || '';

  // Nothing going on: a small chip that stays out of the way of the header under it
  if (phase === 'idle' && !line && !heard && !isOpen) {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.25rem)] z-40 flex justify-center">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-line bg-panel/95 px-2.5 py-1 text-[11px] font-medium text-muted shadow-md hover:text-fg"
          title="Listening for “Hey Boo”. Tap to type a command, or to stop."
          aria-label="Voice commands are on. Tap to type a command or to stop listening."
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" aria-hidden />
          Hey Boo
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-40 flex justify-center px-3">
      <div
        role="status"
        className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-2xl border border-line bg-panel px-3 py-2.5 text-sm text-fg shadow-xl"
      >
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            phase === 'idle' ? 'bg-brand-soft text-brand' : 'bg-brand text-on-brand'
          } ${phase === 'command' ? 'animate-pulse' : ''}`}
          aria-hidden
        >
          {phase === 'thinking' ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />}
        </span>

        <div className="min-w-0 flex-1">
          {status && <p className="text-xs font-medium text-muted">{status}</p>}
          {heard && <p className="private truncate italic">“{heard}”</p>}
          {line && <p className="leading-snug">{line}</p>}

          {/* ⌨️ Typed instead of spoken — it goes exactly the same way */}
          {isOpen && ['idle', 'command', 'reply'].includes(phase) && (
            <form
              className="mt-2 flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const command = typed.trim();
                if (!command) return;
                setTyped('');
                run(command);
              }}
            >
              <input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                maxLength={400}
                placeholder="…or type it: call Harinder"
                aria-label="Type a command"
                className="min-w-0 flex-1 rounded-full bg-panel-soft px-3 py-1.5 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-brand/25 md:text-sm"
              />
              <button type="button" onClick={() => setIsOpen(false)} className="shrink-0 text-xs text-muted hover:text-fg">
                Hide
              </button>
            </form>
          )}

          {/* The same answers, for when a tap is easier than talking */}
          {phase === 'confirm' && pending && (
            <div className="mt-2 flex gap-2">
              {pending.kind === 'message' ? (
                <button
                  type="button"
                  onClick={() => sendPending(pending)}
                  className="flex-1 rounded-full bg-brand py-1.5 font-medium text-on-brand hover:bg-brand-strong"
                >
                  Yes, send
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => placeCall(pending)}
                  className="flex-1 rounded-full bg-brand py-1.5 font-medium text-on-brand hover:bg-brand-strong"
                >
                  Call now
                </button>
              )}
              <button
                type="button"
                onClick={cancelPending}
                className="flex-1 rounded-full border border-line py-1.5 font-medium hover:bg-hover"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setVoice(false)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg"
          aria-label="Stop listening"
          title="Stop listening"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
