import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export default function Page() {
  return (
    <div className="min-h-screen w-full relative overflow-hidden flex flex-col items-center justify-center p-4 py-12">
      {/* Logo Section */}
      <div className="relative z-10 mb-8 flex flex-col items-center animate-fade-in">
        <div className="flex items-center gap-2 mb-2">
          <Link
            href="/"
            className="text-3xl font-bold text-white"
          >
            Aven Reader
          </Link>
        </div>
        <p className="text-neutral-500 text-sm">Join thousands of users creating AI audiobooks</p>
      </div>

      <div className="relative z-10 w-full flex items-center justify-center animate-fade-in-up">
        <SignUp
          appearance={{
            variables: {
              colorBackground: "#111111",
              colorInputBackground: "rgba(255, 255, 255, 0.04)",
              colorText: "#ffffff",
              colorTextSecondary: "#a3a3a3",
              colorTextOnPrimaryBackground: "#000000",
              colorPrimary: "#ffffff",
              colorDanger: "#ef4444",
              colorSuccess: "#10b981",
              colorWarning: "#f59e0b",
              colorInputText: "#ffffff",
              colorAlphaShade: "rgba(255, 255, 255, 0.04)",
              borderRadius: "12px",
              fontFamily: "'Inter', sans-serif",
              fontSize: "14px",
            },
            layout: {
              socialButtonsVariant: "blockButton",
              socialButtonsPlacement: "top",
            },
            elements: {
              rootBox: "mx-auto w-full max-w-md",
              cardBox: "shadow-none w-full",
              card: "!bg-[#111111] border border-white/[0.08] rounded-xl",
              headerTitle: "text-white font-bold text-2xl",
              headerSubtitle: "text-neutral-400 font-medium",
              socialButtonsBlockButton:
                "!bg-white/[0.04] !border !border-white/[0.08] hover:!bg-white/[0.08] !text-white transition-all duration-200 rounded-xl",
              socialButtonsBlockButtonText: "!text-white font-medium",
              socialButtonsProviderIcon__apple: "invert",
              socialButtonsProviderIcon__github: "invert",
              dividerLine: "!bg-white/[0.08]",
              dividerText: "!text-neutral-500 font-semibold uppercase text-[10px] tracking-widest",
              formFieldLabel: "!text-neutral-400 font-semibold text-xs uppercase tracking-wide",
              formFieldHintText: "!text-neutral-400 font-medium",
              formFieldInput:
                "!bg-white/[0.04] !border-white/[0.08] !text-white focus:!border-white/30 focus:!ring-1 focus:!ring-white/10 transition-all duration-200 placeholder:!text-neutral-600 rounded-xl",
              formFieldInputShowPasswordButton: "!text-neutral-400 hover:!text-white",
              formButtonPrimary:
                "!bg-white !text-black hover:!opacity-90 transition-opacity duration-200 !border-none font-bold py-2.5 !rounded-lg",
              formButtonReset: "!text-neutral-400 hover:!text-white font-semibold",
              footerAction: "!bg-transparent",
              footerActionText: "!text-neutral-500 font-medium",
              footerActionLink:
                "!text-neutral-300 hover:!text-white font-bold transition-all duration-200",
              footer: "!bg-white/[0.02] !border-t !border-white/[0.06]",
              identityPreview: "!bg-white/[0.04] !border !border-white/[0.08] rounded-xl",
              identityPreviewText: "!text-white",
              identityPreviewEditButton: "!text-neutral-400 hover:!text-white",
              identityPreviewEditButtonIcon: "!text-neutral-400",
              otpCodeFieldInput:
                "!bg-white/[0.04] !border-white/[0.08] !text-white focus:!border-white/30 rounded-lg",
              alternativeMethodsBlockButton:
                "!bg-white/[0.04] !border !border-white/[0.08] !text-white hover:!bg-white/[0.08] rounded-xl",
              formResendCodeLink: "!text-neutral-400 hover:!text-white",
              alert: "!bg-red-500/10 !border !border-red-500/20 !text-red-300 rounded-xl",
              alertText: "!text-red-300",
              badge: "!bg-white/[0.08] !text-neutral-300 !border !border-white/[0.08]",
              avatarBox: "ring-2 ring-white/20",
              main: "[&>*]:!text-white",
              headerBackRow: "!text-neutral-400",
              headerBackLink: "!text-neutral-400 hover:!text-white",
              headerBackIcon: "!text-neutral-400",
            },
          }}
        />
      </div>

      {/* Footer Links */}
      <div className="relative z-10 mt-8 flex gap-6 text-xs text-neutral-500 animate-fade-in">
        <Link href="/" className="hover:text-white transition-colors duration-200">Home</Link>
        <Link href="/pricing" className="hover:text-white transition-colors duration-200">Pricing</Link>
        <Link href="#" className="hover:text-white transition-colors duration-200">Terms</Link>
        <Link href="#" className="hover:text-white transition-colors duration-200">Privacy</Link>
      </div>
    </div>
  );
}
