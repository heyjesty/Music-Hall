export const loadSpotifySDK = (): Promise<void> => {
  return new Promise((resolve) => {
    if ((window as any).Spotify) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.async = true;
    document.body.appendChild(script);
    (window as any).onSpotifyWebPlaybackSDKReady = () => {
      resolve();
    };
  });
};

export const initializeSpotifyPlayer = (
  token: string, 
  onReady: (player: any) => void,
  onStateChange: (state: any) => void
): any => {
  const player = new (window as any).Spotify.Player({
    name: 'Antigravity Music Hall',
    getOAuthToken: (cb: any) => { cb(token); },
    volume: 0.5
  });

  player.addListener('ready', ({ device_id }: { device_id: string }) => {
    console.log('Ready with Device ID', device_id);
    onReady(player);
  });

  player.addListener('not_ready', ({ device_id }: { device_id: string }) => {
    console.log('Device ID has gone offline', device_id);
  });

  player.addListener('player_state_changed', (state: any) => {
    if (!state) return;
    onStateChange(state);
  });

  player.connect();
  return player;
};
