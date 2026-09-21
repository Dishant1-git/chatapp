import ChatWindow from '@/components/ChatWindow';

export default async function ConversationPage({ params }) {
  const { id } = await params;
  // key={id} gives every conversation a fresh ChatWindow (no leftover state)
  return <ChatWindow key={id} conversationId={id} />;
}
