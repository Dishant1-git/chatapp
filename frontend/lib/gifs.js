import { api } from './client';

// 🎞️ Whether this server can search GIFs (it needs a GIPHY key). Asked once
// per session; without it the GIF tab isn't shown at all.
let answer = null;

export function gifsAvailable() {
  if (!answer) {
    answer = api('/api/gifs/config')
      .then((data) => Boolean(data.available))
      .catch(() => false);
  }
  return answer;
}
