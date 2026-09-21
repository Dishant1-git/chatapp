'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useChat } from './ChatProvider';
import { CallScreen, IncomingCall, MinimizedCall } from './CallScreen';
import { api } from '@/lib/client';
import { playHangupSound, startRingback, startRingtone } from '@/lib/sounds';

// Voice and video calls with WebRTC. Audio and video travel directly between
// browsers (or through a TURN relay), always encrypted by WebRTC (DTLS-SRTP).
// The server only relays the setup messages and tracks who's in which call.
// In a group call every participant connects to every other one: whoever
// joins sends an offer to each person already in the call, so two people
// never make offers to each other at the same time.

const CallContext = createContext(null);

export function useCalls() {
  return useContext(CallContext);
}

const END_REASONS = {
  declined: 'Call declined',
  'no-answer': 'No answer',
  removed: 'You were removed from the group',
};

function mediaErrorMessage(err, video) {
  if (!navigator.mediaDevices) return 'Calls need a secure (https) connection.';
  if (err?.name === 'NotAllowedError') {
    return `Allow access to your microphone${video ? ' and camera' : ''} in the browser to make calls.`;
  }
  if (err?.name === 'NotFoundError') return `No microphone${video ? ' or camera' : ''} was found.`;
  if (err?.name === 'NotReadableError') return `Your microphone${video ? ' or camera' : ''} is being used by another app.`;
  return 'Could not start your microphone or camera.';
}

export default function CallProvider({ children }) {
  const { socket, conversations } = useChat();

  const [activeCalls, setActiveCalls] = useState({}); // { [conversationId]: call }
  const [incoming, setIncoming] = useState(null);
  const [currentCall, setCurrentCall] = useState(null); // { callId, conversationId, video, status, startedAt }
  const [peers, setPeers] = useState({}); // { [userId]: { stream, audio, video, state } }
  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [facingMode, setFacingMode] = useState('user');
  const [isMinimized, setIsMinimized] = useState(false);
  const [callNotice, setCallNotice] = useState('');
  const [callConversations, setCallConversations] = useState({}); // chats not in the list yet

  const socketRef = useRef(socket);
  const currentRef = useRef(null);
  const incomingRef = useRef(null);
  const localStreamRef = useRef(null);
  const connections = useRef(new Map()); // userId → { pc, pendingCandidates, isInitiator }
  const signalChains = useRef(new Map()); // userId → promise, so each person's signals run in order
  const iceServers = useRef(null);
  const stopSound = useRef(() => {});
  const noticeTimer = useRef(null);

  useEffect(() => {
    socketRef.current = socket;
    currentRef.current = currentCall;
  });

  const showCallNotice = useCallback((text) => {
    setCallNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setCallNotice(''), 3000);
  }, []);

  // The ringing call. Kept in a ref too, so socket handlers see the latest one.
  function showIncoming(call) {
    incomingRef.current = call;
    setIncoming(call);
  }

  function playSound(start) {
    stopSound.current();
    stopSound.current = start();
  }

  function silence() {
    stopSound.current();
    stopSound.current = () => {};
  }

  // Socket.IO request with a reply, as a promise
  const request = useCallback((event, data) => {
    return new Promise((resolve, reject) => {
      const s = socketRef.current;
      if (!s?.connected) return reject(new Error("You're offline. Check your connection and try again."));
      s.timeout(10000).emit(event, data, (err, response) => {
        if (err) return reject(new Error('The server did not respond. Please try again.'));
        if (response?.error) return reject(new Error(response.error));
        resolve(response || {});
      });
    });
  }, []);

  async function getIceServers() {
    if (!iceServers.current) {
      try {
        iceServers.current = (await api('/api/calls/config')).iceServers;
      } catch {
        iceServers.current = [{ urls: 'stun:stun.l.google.com:19302' }];
      }
    }
    return iceServers.current;
  }

  async function getMedia(video, facing = 'user') {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: video ? { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
    } catch (err) {
      throw new Error(mediaErrorMessage(err, video));
    }
  }

  function updatePeer(userId, changes) {
    // Late events from a call that already ended
    if (!currentRef.current) return;
    setPeers((prev) => ({ ...prev, [userId]: { audio: true, video: true, state: 'connecting', ...prev[userId], ...changes } }));
  }

  function removePeer(userId) {
    const entry = connections.current.get(userId);
    entry?.pc.close();
    connections.current.delete(userId);
    setPeers((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }

  // Ends everything on this side: connections, camera/mic, sounds and screens
  const cleanup = useCallback(() => {
    silence();
    connections.current.forEach(({ pc }) => pc.close());
    connections.current.clear();
    signalChains.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    currentRef.current = null;
    setLocalStream(null);
    setPeers({});
    setCurrentCall(null);
    setIsMinimized(false);
    setMicOn(true);
    setCameraOn(true);
    setFacingMode('user');
  }, []);

  function sendSignal(to, data) {
    const call = currentRef.current;
    if (!call) return;
    request('call:signal', { callId: call.callId, to, data }).catch(() => {});
  }

  function markConnected() {
    silence();
    setCurrentCall((call) =>
      call && call.status !== 'active' ? { ...call, status: 'active', startedAt: call.startedAt || Date.now() } : call
    );
  }

  // Synchronous on purpose: the connection must be registered before any
  // network candidates for it arrive (ICE servers are fetched before the call starts)
  function createConnection(userId, isInitiator) {
    const pc = new RTCPeerConnection({ iceServers: iceServers.current || [] });
    const entry = { pc, pendingCandidates: [], isInitiator };
    connections.current.set(userId, entry);

    localStreamRef.current?.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) sendSignal(userId, { type: 'candidate', candidate: candidate.toJSON() });
    };

    pc.ontrack = ({ streams, track }) => {
      const stream = streams[0] || new MediaStream([track]);
      updatePeer(userId, { stream });
    };

    pc.onconnectionstatechange = async () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        updatePeer(userId, { state: 'connected' });
        markConnected();
      } else if (state === 'failed') {
        updatePeer(userId, { state: 'reconnecting' });
        // The side that made the offer tries again with fresh network routes
        if (entry.isInitiator) {
          try {
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
            sendSignal(userId, { type: 'offer', description: pc.localDescription.toJSON() });
          } catch {
            // Gave up — the other side can still hang up
          }
        }
      } else if (state === 'disconnected') {
        updatePeer(userId, { state: 'reconnecting' });
      }
    };

    return entry;
  }

  async function flushCandidates(entry) {
    const pending = entry.pendingCandidates.splice(0);
    for (const candidate of pending) {
      await entry.pc.addIceCandidate(candidate).catch(() => {});
    }
  }

  async function callPeer(userId) {
    const entry = createConnection(userId, true);
    updatePeer(userId, {});
    const offer = await entry.pc.createOffer();
    // The call ended or this person left while we were waiting
    if (connections.current.get(userId) !== entry) return;
    await entry.pc.setLocalDescription(offer);
    if (connections.current.get(userId) !== entry) return;
    sendSignal(userId, { type: 'offer', description: entry.pc.localDescription.toJSON() });
  }

  // Tells the others whether my mic/camera are on (e.g. someone joins while I'm muted)
  function shareMediaState() {
    const call = currentRef.current;
    const stream = localStreamRef.current;
    if (!call || !stream) return;
    const isOn = (track) => Boolean(track?.enabled && track.readyState === 'live');
    const audio = isOn(stream.getAudioTracks()[0]);
    const video = isOn(stream.getVideoTracks()[0]);
    request('call:media', { callId: call.callId, audio, video }).catch(() => {});
  }

  // The browser can stop the camera by itself (unplugged, taken by another app,
  // permission revoked). Show it as off so it can be switched back on.
  function watchVideoTrack(track) {
    track.addEventListener('ended', () => {
      if (localStreamRef.current?.getVideoTracks()[0] !== track) return;
      setCameraOn(false);
      shareMediaState();
      showCallNotice('Your camera stopped. Tap the camera button to turn it back on.');
    });
  }

  // Puts a new camera track in place of the old one, for everyone in the call
  async function swapVideoTrack(newTrack) {
    const stream = localStreamRef.current;
    if (!stream) return newTrack.stop();
    for (const { pc } of connections.current.values()) {
      const transceiver = pc.getTransceivers().find((t) => t.receiver.track?.kind === 'video');
      await transceiver?.sender.replaceTrack(newTrack);
    }
    stream.getVideoTracks().forEach((old) => {
      stream.removeTrack(old);
      old.stop();
    });
    stream.addTrack(newTrack);
    watchVideoTrack(newTrack);
    setLocalStream(new MediaStream(stream.getTracks()));
  }

  // Makes a stream captured for one kind of call fit another:
  // joining a voice call must not keep the camera on
  async function fitStream(stream, video) {
    if (!video) {
      stream.getVideoTracks().forEach((track) => {
        track.stop();
        stream.removeTrack(track);
      });
      return stream;
    }
    if (stream.getVideoTracks().length) return stream;
    stream.getTracks().forEach((t) => t.stop());
    return getMedia(true);
  }

  function attachLocalStream(stream) {
    localStreamRef.current = stream;
    stream.getVideoTracks().forEach(watchVideoTrack);
    setLocalStream(stream);
  }

  // Answers a ringing call, or joins one that's already going on in a chat
  const joinCall = useCallback(
    async (call, existingStream = null) => {
      if (currentRef.current && currentRef.current.callId !== call.callId) throw new Error("You're already in a call.");
      // Joining from the chat while it's ringing: close the ringing card too
      if (incomingRef.current?.callId === call.callId) {
        silence();
        showIncoming(null);
      }
      await getIceServers();
      const stream = existingStream ? await fitStream(existingStream, call.video) : await getMedia(call.video);
      attachLocalStream(stream);

      const pending = { callId: call.callId, conversationId: call.conversationId, video: call.video, status: 'connecting' };
      currentRef.current = pending;
      setCurrentCall(pending);

      let joined = false;
      try {
        const { peers: others } = await request('call:join', { callId: call.callId });
        joined = true;
        for (const userId of others) await callPeer(userId);
      } catch (err) {
        // Don't stay in the call on the server if something failed on our side
        if (joined) request('call:leave', { callId: call.callId }).catch(() => {});
        cleanup();
        throw err;
      }
    },
    [request, cleanup]
  );

  const startCall = useCallback(
    async (conversationId, video) => {
      if (currentRef.current) throw new Error("You're already in a call.");
      await getIceServers();
      const stream = await getMedia(video);

      let response;
      try {
        response = await request('call:start', { conversationId, video });
      } catch (err) {
        stream.getTracks().forEach((t) => t.stop());
        throw err;
      }

      // Someone else in this chat started a call first — join theirs
      if (response.existing) return joinCall(response.existing, stream);

      attachLocalStream(stream);
      const call = { callId: response.call.callId, conversationId, video, status: 'calling' };
      currentRef.current = call;
      setCurrentCall(call);
      playSound(startRingback);
    },
    [request, joinCall]
  );

  const acceptIncoming = useCallback(async () => {
    const call = incomingRef.current;
    if (!call) return;
    silence();
    showIncoming(null);
    try {
      await joinCall(call);
    } catch (err) {
      showCallNotice(err.message);
    }
  }, [joinCall, showCallNotice]);

  const declineIncoming = useCallback(() => {
    const call = incomingRef.current;
    if (!call) return;
    silence();
    request('call:decline', { callId: call.callId }).catch(() => {});
    showIncoming(null);
  }, [request]);

  const hangUp = useCallback(() => {
    const call = currentRef.current;
    if (!call) return;
    request('call:leave', { callId: call.callId }).catch(() => {});
    playHangupSound();
    cleanup();
  }, [request, cleanup]);

  const toggleMic = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
    shareMediaState();
  }, []);

  const toggleCamera = useCallback(async () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track || !currentRef.current?.video) return;

    // The camera was stopped by the browser: start it again
    if (track.readyState === 'ended') {
      try {
        const fresh = await getMedia(true, facingMode);
        fresh.getAudioTracks().forEach((t) => t.stop());
        await swapVideoTrack(fresh.getVideoTracks()[0]);
        setCameraOn(true);
        shareMediaState();
      } catch (err) {
        showCallNotice(err.message);
      }
      return;
    }

    track.enabled = !track.enabled;
    setCameraOn(track.enabled);
    shareMediaState();
  }, [facingMode, showCallNotice]);

  // Front ↔ back camera on phones
  const flipCamera = useCallback(async () => {
    const oldTrack = localStreamRef.current?.getVideoTracks()[0];
    if (!oldTrack) return;
    const nextFacing = facingMode === 'user' ? 'environment' : 'user';
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: nextFacing } } });
      const newTrack = fresh.getVideoTracks()[0];
      newTrack.enabled = oldTrack.enabled;
      await swapVideoTrack(newTrack);
      setFacingMode(nextFacing);
    } catch {
      showCallNotice('Could not switch the camera.');
    }
  }, [facingMode, showCallNotice]);

  // ---- Socket events ----
  useEffect(() => {
    if (!socket) return;

    function onIncoming(call) {
      // Already busy: the caller will see "no answer" if nobody else picks up
      if (currentRef.current || incomingRef.current) return;
      showIncoming(call);
      playSound(startRingtone);
      getIceServers();
    }

    function stopRinging(callId) {
      if (incomingRef.current?.callId !== callId) return;
      silence();
      showIncoming(null);
    }

    function onAnsweredElsewhere({ callId }) {
      stopRinging(callId);
    }

    function onEnded({ callId, reason }) {
      stopRinging(callId);
      if (currentRef.current?.callId === callId) {
        const wasWaiting = currentRef.current.status === 'calling';
        playHangupSound();
        cleanup();
        if (END_REASONS[reason] && (wasWaiting || reason === 'removed')) showCallNotice(END_REASONS[reason]);
      }
    }

    function onParticipantJoined({ callId, userId }) {
      if (currentRef.current?.callId !== callId) return;
      silence();
      updatePeer(userId, {});
      setCurrentCall((call) => (call?.status === 'calling' ? { ...call, status: 'connecting' } : call));
      // Newcomers assume everyone's mic and camera are on until told otherwise
      const stream = localStreamRef.current;
      if (stream?.getAudioTracks()[0]?.enabled === false || stream?.getVideoTracks()[0]?.enabled === false) {
        shareMediaState();
      }
    }

    function onParticipantLeft({ callId, userId }) {
      if (currentRef.current?.callId === callId) removePeer(userId);
    }

    async function handleSignal(callId, from, data) {
      if (currentRef.current?.callId !== callId || !data) return;
      try {
        let entry = connections.current.get(from);
        if (data.type === 'offer') {
          if (!entry) entry = createConnection(from, false);
          await entry.pc.setRemoteDescription(data.description);
          const answer = await entry.pc.createAnswer();
          // The call ended or they left while we were working
          if (connections.current.get(from) !== entry) return;
          await entry.pc.setLocalDescription(answer);
          sendSignal(from, { type: 'answer', description: entry.pc.localDescription.toJSON() });
          await flushCandidates(entry);
        } else if (data.type === 'answer' && entry) {
          await entry.pc.setRemoteDescription(data.description);
          await flushCandidates(entry);
        } else if (data.type === 'candidate' && entry) {
          // Candidates can arrive before the offer/answer they belong to
          if (entry.pc.remoteDescription) await entry.pc.addIceCandidate(data.candidate);
          else entry.pendingCandidates.push(data.candidate);
        }
      } catch (err) {
        console.warn('[call] signal failed:', err);
      }
    }

    // Candidates can arrive while an offer is still being processed, so each
    // person's signals are handled strictly one after another
    function onSignal({ callId, from, data }) {
      const previous = signalChains.current.get(from) || Promise.resolve();
      signalChains.current.set(from, previous.then(() => handleSignal(callId, from, data)));
    }

    function onMedia({ callId, userId, audio, video }) {
      if (currentRef.current?.callId === callId) updatePeer(userId, { audio, video });
    }

    function onState({ conversationId, active, call }) {
      setActiveCalls((prev) => {
        const next = { ...prev };
        if (active) next[conversationId] = call;
        else delete next[conversationId];
        return next;
      });
    }

    function onActive({ calls }) {
      setActiveCalls(Object.fromEntries(calls.map((c) => [c.conversationId, c])));
    }

    function onConnect() {
      // The server sends the current calls again right after connecting
      setActiveCalls({});
    }

    function onDisconnect() {
      // The server drops us from the call when the connection is lost
      if (currentRef.current) {
        cleanup();
        showCallNotice('Call ended: connection lost');
      }
      showIncoming(null);
      silence();
    }

    socket.on('call:incoming', onIncoming);
    socket.on('call:answered-elsewhere', onAnsweredElsewhere);
    socket.on('call:ended', onEnded);
    socket.on('call:participant-joined', onParticipantJoined);
    socket.on('call:participant-left', onParticipantLeft);
    socket.on('call:signal', onSignal);
    socket.on('call:media', onMedia);
    socket.on('call:state', onState);
    socket.on('call:active', onActive);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:answered-elsewhere', onAnsweredElsewhere);
      socket.off('call:ended', onEnded);
      socket.off('call:participant-joined', onParticipantJoined);
      socket.off('call:participant-left', onParticipantLeft);
      socket.off('call:signal', onSignal);
      socket.off('call:media', onMedia);
      socket.off('call:state', onState);
      socket.off('call:active', onActive);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket, cleanup, showCallNotice]);

  // Hang up if the page is closed during a call
  useEffect(() => () => cleanup(), [cleanup]);

  // The chat a call belongs to. A brand-new direct chat may not be in the list yet.
  const callConversationId = currentCall?.conversationId || incoming?.conversationId;
  const listed = conversations.find((c) => c._id === callConversationId);
  useEffect(() => {
    if (!callConversationId || listed || callConversations[callConversationId]) return;
    api(`/api/conversations/${callConversationId}`)
      .then(({ conversation }) => setCallConversations((prev) => ({ ...prev, [conversation._id]: conversation })))
      .catch(() => {});
  }, [callConversationId, listed, callConversations]);
  const conversationFor = (id) => conversations.find((c) => c._id === id) || callConversations[id] || null;

  const value = useMemo(
    () => ({ activeCalls, currentCall, startCall, joinCall }),
    [activeCalls, currentCall, startCall, joinCall]
  );

  return (
    <CallContext.Provider value={value}>
      {children}

      <AnimatePresence>
        {incoming && !currentCall && (
          <IncomingCall
            key={`incoming-${incoming.callId}`}
            call={incoming}
            conversation={conversationFor(incoming.conversationId)}
            onAccept={acceptIncoming}
            onDecline={declineIncoming}
          />
        )}
        {currentCall && !isMinimized && (
          <CallScreen
            key="call"
            call={currentCall}
            conversation={conversationFor(currentCall.conversationId)}
            peers={peers}
            localStream={localStream}
            micOn={micOn}
            cameraOn={cameraOn}
            facingMode={facingMode}
            onToggleMic={toggleMic}
            onToggleCamera={toggleCamera}
            onFlipCamera={flipCamera}
            onHangUp={hangUp}
            onMinimize={() => setIsMinimized(true)}
          />
        )}
      </AnimatePresence>

      {/* Everyone's voice, kept here so it keeps playing while the call screen is minimized */}
      {currentCall &&
        Object.entries(peers).map(([userId, peer]) => <RemoteAudio key={userId} stream={peer.stream} />)}

      {currentCall && isMinimized && (
        <MinimizedCall
          call={currentCall}
          conversation={conversationFor(currentCall.conversationId)}
          peers={peers}
          onExpand={() => setIsMinimized(false)}
          onHangUp={hangUp}
        />
      )}

      {callNotice && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-[60] flex justify-center px-4">
          <p className="rounded-full bg-fg px-4 py-2 text-center text-sm text-panel shadow-lg">{callNotice}</p>
        </div>
      )}
    </CallContext.Provider>
  );
}

function RemoteAudio({ stream }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream || null;
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}
