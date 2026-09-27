import { TelegramProvider } from '@/components/twa/TelegramProvider';

export default function TwaLayout({ children }: { children: React.ReactNode }) {
  return <TelegramProvider>{children}</TelegramProvider>;
}