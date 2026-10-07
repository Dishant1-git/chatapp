// The app's logo. In December it wears a red cap (see FestiveCap).
export default function Logo({ size = 64, src = '/logo-128.webp', className = '' }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <img src={src} alt="" width={size} height={size} className={`h-full w-full ${className}`} />
      <FestiveCap />
    </span>
  );
}

// 🎅 A Santa cap for whatever it's put inside (which has to be position: relative):
// the logo, Boo. It's always there and normally invisible — globals.css shows it
// while <html> has data-hat="santa", which lib/festivals.js sets in December.
export function FestiveCap() {
  return <span className="festive-cap" aria-hidden />;
}
