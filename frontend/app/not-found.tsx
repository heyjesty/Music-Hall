import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <p className="text-7xl font-black text-gradient mb-4">404</p>
      <h1 className="text-2xl font-bold mb-2">This track doesn&apos;t exist</h1>
      <p className="text-gray-400 mb-8">The page you&apos;re looking for has left the room.</p>
      <Link href="/" className="btn-primary">Back to home</Link>
    </div>
  );
}
