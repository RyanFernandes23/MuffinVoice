import { ClerkProvider } from '@clerk/nextjs'
import Script from 'next/script'
import './globals.css'
import Navbar from './components/Navbar'
import AnimatedBackground from './components/AnimatedBackground'
import { Toaster } from 'react-hot-toast'

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
          <AnimatedBackground />
          <div className="relative z-10 flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-1 overflow-y-auto">
              <Toaster
                position="bottom-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: '#111111',
                    color: '#ffffff',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                    borderRadius: '8px',
                    fontSize: '14px',
                  },
                  success: {
                    iconTheme: {
                      primary: '#10b981',
                      secondary: '#000000',
                    },
                  },
                  error: {
                    iconTheme: {
                      primary: '#ef4444',
                      secondary: '#000000',
                    },
                  },
                  loading: {
                    iconTheme: {
                      primary: '#a3a3a3',
                      secondary: '#000000',
                    },
                  },
                }}
              />
              {children}
            </main>
          </div>
        </body>
      </html>
    </ClerkProvider>
  )
}
