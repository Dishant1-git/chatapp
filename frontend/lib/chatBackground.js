// 🖼️ Chat backgrounds: a picture behind the messages of ONE chat.
// Everyone in that chat sees it — in a group, every member.
//
// Unlike messages, photos and videos, a background is NOT end-to-end encrypted:
// it's stored and served by the server like a group photo.

// The CSS for a chat's background: the picture, faded by `dim`
// so the messages on top of it stay easy to read.
export function backgroundStyle(url, dim = 0.25) {
  if (!url) return undefined;
  const fade = `rgba(0, 0, 0, ${dim})`;
  return {
    backgroundImage: `linear-gradient(${fade}, ${fade}), url("${url}")`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };
}
