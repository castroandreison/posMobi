import React, { useState } from 'react';
import { Outlet } from 'react-router';
import { Header } from '../components/header';
import { Sidebar } from '../components/sidebar';
import { Footer } from '../components/footer';

interface FulllayoutProps {
  onLogout: () => void;
}

export const Fulllayout: React.FC<FulllayoutProps> = ({ onLogout }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <Header onLogout={onLogout} onMenu={() => setSidebarOpen(true)} />
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
        <Footer />
      </div>
    </div>
  );
};
