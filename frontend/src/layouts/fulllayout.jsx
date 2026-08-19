import React, { useState } from 'react';
import { Outlet } from 'react-router';
import { Header } from '../components/header.jsx';
import { Sidebar } from '../components/sidebar.jsx';
import { Footer } from '../components/footer.jsx';

export const Fulllayout = ({ onLogout }) => {
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