import { userColor } from '@/lib/types';

export default function Avatar({ name, size = 32, ring = false }: { name: string; size?: number; ring?: boolean }) {
  return (
    <span
      title={name}
      className={`inline-flex items-center justify-center rounded-full font-bold text-black/80 shrink-0 select-none ${ring ? 'ring-2 ring-background' : ''}`}
      style={{ width: size, height: size, background: userColor(name), fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
