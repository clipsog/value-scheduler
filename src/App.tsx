import React, { useState } from 'react';
import { Calendar, CreditCard, Briefcase, Users, LayoutDashboard } from 'lucide-react';
import { AppDataProvider } from './context/AppDataContext';
import ScheduleView from './components/ScheduleView';
import SubscriptionsView from './components/SubscriptionsView';
import AssetsView from './components/AssetsView';
import NetworkView from './components/NetworkView';
import DashboardView from './components/DashboardView';

const Layout = ({ children, activeTab, setActiveTab }: { children: React.ReactNode, activeTab: string, setActiveTab: (t: string) => void }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'schedule', label: 'Schedule', icon: <Calendar size={20} /> },
    { id: 'network', label: 'Network', icon: <Users size={20} /> },
    { id: 'subscriptions', label: 'Subscriptions', icon: <CreditCard size={20} /> },
    { id: 'assets', label: 'Assets', icon: <Briefcase size={20} /> },
  ];

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div style={{ marginBottom: '2rem', padding: '0 1rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, var(--primary), var(--primary-hover))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 'bold' }}>A</div>
            Asset
          </h2>
        </div>
        <nav style={{ flex: 1 }}>
          {navItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <div style={{ color: activeTab === item.id ? 'var(--primary)' : 'inherit' }}>{item.icon}</div>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <AppDataProvider>
      <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
        {activeTab === 'dashboard' && <DashboardView />}
        {activeTab === 'schedule' && <ScheduleView />}
        {activeTab === 'network' && <NetworkView />}
        {activeTab === 'subscriptions' && <SubscriptionsView />}
        {activeTab === 'assets' && <AssetsView />}
      </Layout>
    </AppDataProvider>
  );
}

export default App;
