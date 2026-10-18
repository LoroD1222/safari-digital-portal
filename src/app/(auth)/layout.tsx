import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-7 bg-sidebar px-4 py-12">
      <Image src="/safari-digital-logo.svg" alt="Safari Digital" width={178} height={28} priority className="h-7 w-auto" />
      <div className="w-full max-w-[380px] rounded-card border border-line bg-white px-7 py-8 shadow-[0_1px_2px_rgba(0,3,33,0.04)]">{children}</div>
      <p className="text-center text-[13px] text-slate">New client? Use the invite link Safari Digital sent you.</p>
    </div>
  );
}
