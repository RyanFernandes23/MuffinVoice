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
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
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
              <Toaster
                position="bottom-right"
                toastOptions={{
                  duration: 4000,
                  style: {
                    background: 'rgba(255, 255, 255, 0.08)', // glass-card background
                    color: '#e0e0e0', // Light gray text
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
                  },
                  success: {
                    iconTheme: {
                      primary: '#4CAF50', // Green for success
                      secondary: '#000000',
                    },
                  },
                  error: {
                    iconTheme: {
                      primary: '#F44336', // Red for error
                      secondary: '#000000',
                    },
                  },
                  loading: {
                    iconTheme: {
                      primary: '#2196F3', // Blue for loading
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
