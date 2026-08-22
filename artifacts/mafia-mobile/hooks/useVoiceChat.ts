import { useEffect, useRef, useState } from 'react';
import { Room } from 'livekit-client';
import { AudioSession } from '@livekit/react-native';

export function useVoiceChat(code: string, playerId: string, nickname: string, baseUrl: string | null) {
  const roomRef = useRef<Room | null>(null);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  useEffect(() => {
    AudioSession.startAudioSession();
    return () => {
      AudioSession.stopAudioSession();
    };
  }, []);

  useEffect(() => {
    if (!code || !playerId || !baseUrl) return;
    let cancelled = false;
    const room = new Room();
    roomRef.current = room;

    async function connectVoice() {
      try {
        const res = await fetch(`${baseUrl}/api/rooms/${code}/voice-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId, nickname }),
        });
        if (!res.ok) throw new Error(`Voice token HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        await room.connect(data.url, data.token);
        if (cancelled) return;
        await room.localParticipant.setMicrophoneEnabled(false);
        setVoiceConnected(true);
        setVoiceError(null);
      } catch (err: any) {
        if (!cancelled) {
          const detail = err?.message || err?.toString?.() || JSON.stringify(err);
          const cause = err?.cause ? ` | cause: ${err.cause?.message || err.cause}` : '';
          setVoiceError(`${detail}${cause}`);
        }
      }
    }

    connectVoice();

    return () => {
      cancelled = true;
      room.disconnect();
      roomRef.current = null;
      setVoiceConnected(false);
    };
  }, [code, playerId, baseUrl]);

  const setMicrophoneEnabled = async (enabled: boolean) => {
    try {
      await roomRef.current?.localParticipant.setMicrophoneEnabled(enabled);
    } catch (err: any) {
      setVoiceError(err?.message ?? 'Erreur micro');
    }
  };

  return { voiceConnected, voiceError, setMicrophoneEnabled };
}