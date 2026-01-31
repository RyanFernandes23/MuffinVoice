import { ClerkProvider } from '@clerk/nextjs'
import Script from 'next/script'
import './globals.css'
import Navbar from './components/Navbar'
import AnimatedBackground from './components/AnimatedBackground'
import { Toaster } from 'react-hot-toast'

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en" className="relative">
        <head>
          <Script
            src="https://checkout.razorpay.com/v1/checkout.js"
            strategy="beforeInteractive"
          />
        </head>
        <body className="flex flex-col h-screen relative overflow-hidden">
          <AnimatedBackground />
          <div className="relative z-10">
            <Navbar />
            <main className="grow">
              <Toaster position="top-right" />
              {children}
            </main>
          </div>
        </body>
      </html>
    </ClerkProvider>
  )
}
