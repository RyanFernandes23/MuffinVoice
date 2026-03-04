import { ClerkProvider } from '@clerk/nextjs'
import Script from 'next/script'
import './globals.css'
import Navbar from './components/Navbar'
import ToastProvider from './components/ToastProvider'

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
          <meta name="theme-color" content="#000000" />
          <Script
            src="https://checkout.razorpay.com/v1/checkout.js"
            strategy="beforeInteractive"
          />
        </head>
        <body className="flex flex-col min-h-screen relative bg-background text-foreground overflow-x-hidden">
          <div className="relative z-10 flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-1 overflow-y-auto">
              <ToastProvider />
              {children}
            </main>
          </div>
        </body>
      </html>
    </ClerkProvider>
  )
}
