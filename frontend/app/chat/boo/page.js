import BooChat from '@/components/BooChat';

// 👻 The chat with Boo. A fixed route, so it wins over /chat/[id].
export default function BooPage() {
  return <BooChat />;
}
