export default function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center min-h-[70vh]">
      <div className="glass-card p-8 sm:p-10 rounded-3xl w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-gradient">{title}</h1>
        {subtitle && <p className="text-center text-sm text-gray-400 mt-2">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
      {message}
    </p>
  );
}
