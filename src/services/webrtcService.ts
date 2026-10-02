/**
 * WebRTC Direct P2P Live Streaming Service for Guardian
 * Enables true internet cross-device live video & audio streaming between Child Android device and Parent device.
 */

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

let activeParentPc: RTCPeerConnection | null = null;
let activeChildPc: RTCPeerConnection | null = null;

// Wait for ICE gathering to complete so SDP has all host/srflx candidates included
function waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const checkState = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', checkState);
    // Timeout fallback after 1200ms in case slow network
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', checkState);
      resolve();
    }, 1200);
  });
}

// 1. Parent Side: Creates Offer
export async function createParentOffer(
  onStreamReceived: (stream: MediaStream) => void
): Promise<{ pc: RTCPeerConnection; offerSdp: string }> {
  closeParentPeerConnection();

  const pc = new RTCPeerConnection(ICE_SERVERS);
  activeParentPc = pc;

  // Add transceivers to receive both video and audio
  pc.addTransceiver('video', { direction: 'recvonly' });
  pc.addTransceiver('audio', { direction: 'recvonly' });

  pc.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      onStreamReceived(event.streams[0]);
    }
  };

  const offer = await pc.createOffer({
    offerToReceiveVideo: true,
    offerToReceiveAudio: true,
  });
  await pc.setLocalDescription(offer);

  // Wait for ICE candidates so SDP is fully self-contained
  await waitForIceGatheringComplete(pc);

  const finalOfferSdp = pc.localDescription?.sdp || offer.sdp || '';
  return { pc, offerSdp: finalOfferSdp };
}

// Parent receives Child Answer SDP
export async function applyParentAnswer(answerSdp: string): Promise<void> {
  if (!activeParentPc) return;
  if (activeParentPc.signalingState === 'have-local-offer') {
    await activeParentPc.setRemoteDescription(
      new RTCSessionDescription({ type: 'answer', sdp: answerSdp })
    );
  }
}

export function closeParentPeerConnection(): void {
  if (activeParentPc) {
    try {
      activeParentPc.close();
    } catch {
      // ignore
    }
    activeParentPc = null;
  }
}

// 2. Child Side: Receives Offer, attaches local tracks (camera/microphone), creates Answer
export async function handleChildOfferAndCreateAnswer(
  offerSdp: string,
  mediaStream: MediaStream
): Promise<string> {
  closeChildPeerConnection();

  const pc = new RTCPeerConnection(ICE_SERVERS);
  activeChildPc = pc;

  // Attach all local tracks (video & audio) to the peer connection
  mediaStream.getTracks().forEach((track) => {
    pc.addTrack(track, mediaStream);
  });

  await pc.setRemoteDescription(
    new RTCSessionDescription({ type: 'offer', sdp: offerSdp })
  );

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  // Wait for ICE candidates to populate into answer SDP
  await waitForIceGatheringComplete(pc);

  return pc.localDescription?.sdp || answer.sdp || '';
}

export function closeChildPeerConnection(): void {
  if (activeChildPc) {
    try {
      activeChildPc.close();
    } catch {
      // ignore
    }
    activeChildPc = null;
  }
}
