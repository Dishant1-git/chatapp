'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mic, X } from 'lucide-react';
import { useChat } from './ChatProvider';
import { useCalls } from './CallProvider';
import { api } from '@/lib/client';
import { conversationTitle } from '@/lib/conversations';
import { canForwardTo } from '@/lib/forward';
import { afterWakeWords, findChat, isNo, isYes, sendTextTo, setVoice, useVoiceOn, voiceSupported } from '@/lib/voice';

const COMMAND_WINDOW_MS = 8000; // how long "Hey Boo" waits for the command
const CONFIRM_WINDOW_MS = 15000; // how long a "send it?" waits for yes or no
const CALL_COUNTDOWN_MS = 3500; // time to say "cancel" before a call goes out
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

  const [phase, setPhase] = useState('idle'); // idle | command | thinking | confirm
  const [heard, setHeard] = useState(''); // what's being said right now
  const [line, setLine] = useState(''); // what the assistant last said
  const [pending, setPending] = useState(null); // { kind: 'message' | 'call', conversation, text?, video? }

  // The recogniser's callbacks outlive renders, so they read everything from refs
  const phaseRef = useRef('idle');
  const pendingRef = useRef(null);
  const speakingRef = useRef(false);
  const timer = useRef(null);
  const latest = useRef({});
  latest.current = { conversations, myId: user?._id, startCall, router };

  const go = useCallback((next, waiting = null) => {
    clearTimeout(timer.current);
    phaseRef.current = next;
    pendingRef.current = waiting;
    setPhase(next);
    setPending(waiting);
  }, []);

  // Says it out loud and shows it. Nothing heard while it's talking counts —
  // otherwise it would take orders from its own voice.
  const say = useCallback((text) => {
    setLine(text);
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();
      speakingRef.current = true;
      let finished = false;
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
      // Some browsers never fire "end"
      const giveUp = setTimeout(done, 2500 + text.length * 90);
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const backToIdle = useCallback(() => go('idle'), [go]);

  const placeCall = useCallback(
    async ({ conversation, video }) => {
      backToIdle();
      try {
        await latest.current.startCall(conversation._id, video);
      } catch (err) {
        say(err.message);
      }
    },
    [backToIdle, say]
  );

  const sendPending = useCallback(
    async ({ conversation, text }) => {
      go('thinking');
      try {
        await sendTextTo(conversation, text);
        await say('Sent.');
      } catch (err) {
        await say(`It didn’t send. ${err.message}`);
      }
      backToIdle();
    },
    [go, say, backToIdle]
  );

  const cancelPending = useCallback(async () => {
    backToIdle();
    await say('Okay, cancelled.');
  }, [backToIdle, say]);

  const run = useCallback(
    async (command) => {
      go('thinking');
      setHeard(command);
      let result;
      try {
        result = await api('/api/assistant/command', { method: 'POST', body: { text: command } });
      } catch (err) {
        await say(err.message);
        return backToIdle();
      }
      if (result.action === 'none') {
        await say(result.say);
        return backToIdle();
      }

      const { conversations: chats, myId, router: nav } = latest.current;
      const found = findChat(chats, result.name);
      if (found.several) {
        await say(`I found ${found.several.join(' and ')}. Say it again with the full name.`);
        return backToIdle();
      }
      if (!found.conversation) {
        await say(`I couldn’t find ${result.name} in your chats.`);
        return backToIdle();
      }
      const conversation = found.conversation;
      const who = conversationTitle(conversation);

      if (result.action === 'open') {
        nav.push(`/chat/${conversation._id}`);
        await say(`Opening ${who}.`);
        return backToIdle();
      }

      if (!canForwardTo(conversation, myId)) {
        await say(`You can’t reach ${who} right now.`);
        return backToIdle();
      }

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

      // A call: said out loud, then placed unless it's called off in time
      const video = result.action === 'video_call';
      const waiting = { kind: 'call', conversation, video };
      go('confirm', waiting);
      await say(`${video ? 'Video calling' : 'Calling'} ${who}. Say cancel to stop.`);
      if (pendingRef.current !== waiting) return;
      timer.current = setTimeout(() => {
        if (pendingRef.current === waiting) placeCall(waiting);
      }, CALL_COUNTDOWN_MS);
    },
    [go, say, backToIdle, cancelPending, placeCall]
  );

  // One finished sentence from the recogniser
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
      if (phaseNow === 'command') return run(sentence);
      if (phaseNow !== 'idle') return;

      const command = afterWakeWords(sentence);
      if (command === null) return; // not for us — and it goes nowhere
      if (command) return run(command);
      go('command');
      say('Yes?').then(() => {
        if (phaseRef.current !== 'command') return;
        timer.current = setTimeout(() => phaseRef.current === 'command' && backToIdle(), COMMAND_WINDOW_MS);
      });
    },
    [run, go, say, backToIdle, cancelPending, sendPending]
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
        if (event.results[i].isFinal) {
          setHeard('');
          handleHeardRef.current(said);
        } else if (!speakingRef.current && phaseRef.current !== 'idle') {
          // Shown only once it's listening for a command — what's said around
          // the phone the rest of the time isn't put on screen
          setHeard(said);
        }
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
      if (wanted) restart = setTimeout(start, 400);
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

  // Switched off, or a call began: drop whatever was half done
  useEffect(() => {
    if (on && !inCall) return;
    go('idle');
    setHeard('');
    window.speechSynthesis?.cancel();
    speakingRef.current = false;
  }, [on, inCall, go]);

  useEffect(() => () => clearTimeout(timer.current), []);

  // Just switched on: say how it works. And once things go quiet again, what
  // was last said is cleared, leaving only the small "listening" chip.
  useEffect(() => {
    if (on) setLine(HINT);
  }, [on]);
  useEffect(() => {
    if (phase !== 'idle' || !line) return;
    const clear = setTimeout(() => setLine(''), 7000);
    return () => clearTimeout(clear);
  }, [phase, line]);

  if (!on || inCall) return null;

  const status =
    phase === 'thinking' ? 'Working on it…' : phase === 'command' ? 'Listening…' : phase === 'confirm' ? '' : 'Listening for “Hey Boo”';

  // Nothing going on: a small chip that stays out of the way of the header under it
  if (phase === 'idle' && !line && !heard) {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.25rem)] z-40 flex justify-center">
        <button
          type="button"
          onClick={() => setVoice(false)}
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-line bg-panel/95 px-2.5 py-1 text-[11px] font-medium text-muted shadow-md hover:text-fg"
          title="Listening for “Hey Boo”. Tap to stop."
          aria-label="Voice commands are on. Tap to stop listening."
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
