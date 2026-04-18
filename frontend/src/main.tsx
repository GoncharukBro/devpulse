import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import './index.css';

// Initialize theme from localStorage before first render
const savedTheme = localStorage.getItem('devpulse-theme') || 'dark';
if (savedTheme === 'system') {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', isDark);
} else {
  document.documentElement.classList.toggle('dark', savedTheme === 'dark');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/devpulse">
      <App />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          className: '!bg-white !text-gray-900 !border !border-gray-200 dark:!bg-[#1a1a24] dark:!text-gray-200 dark:!border-[#2a2a3a]',
          style: {},
        }}
      />
    </BrowserRouter>
  </StrictMode>,
);
