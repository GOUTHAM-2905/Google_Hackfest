import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import DashboardView from './views/DashboardView';
import DatabaseView from './views/DatabaseView';
import TableDetailView from './views/TableDetailView';
import ChatView from './views/ChatView';
import SettingsView from './views/SettingsView';
import { DatabaseProvider } from './context/DatabaseContext';
import { ChatProvider } from './context/ChatContext';
import Header from './components/layout/Header';
import './index.css';

function AppLayout({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 ml-[240px] flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <DatabaseProvider>
      <ChatProvider>
        <BrowserRouter>
          <AppLayout>
            <Routes>
              <Route path="/" element={<DashboardView />} />
              <Route path="/databases" element={<DatabaseView />} />
              <Route path="/database/:serviceName/:tableName" element={<TableDetailView />} />
              <Route path="/chat" element={
                <div className="flex flex-col h-full">
                  <Header title="Chat" subtitle="Ask anything about your data" />
                  <div className="flex-1 overflow-hidden"><ChatView /></div>
                </div>
              } />
              <Route path="/settings" element={<SettingsView />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppLayout>
        </BrowserRouter>
      </ChatProvider>
    </DatabaseProvider>
  );
}
