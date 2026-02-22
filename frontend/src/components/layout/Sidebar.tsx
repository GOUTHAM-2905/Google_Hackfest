import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Database, MessageSquare, Settings, Cpu } from 'lucide-react';

const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/databases', icon: Database, label: 'Databases' },
    { to: '/chat', icon: MessageSquare, label: 'Chat' },
    { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
    return (
        <aside className="fixed top-0 left-0 h-screen w-[240px] bg-surface-800 border-r border-surface-600 flex flex-col z-40">
            {/* Logo */}
            <div className="flex items-center gap-3 px-5 py-5 border-b border-surface-600">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
                    <Cpu size={16} className="text-white" />
                </div>
                <div>
                    <div className="text-sm font-bold text-white">Turgon</div>
                    <div className="text-xs text-slate-500">Data Dictionary</div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-1">
                {navItems.map(({ to, icon: Icon, label }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={to === '/'}
                        className={({ isActive }) => isActive ? 'nav-link-active' : 'nav-link-inactive'}
                    >
                        <Icon size={17} />
                        <span>{label}</span>
                    </NavLink>
                ))}
            </nav>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-surface-600">
                <div className="text-xs text-slate-500">v1.0.0 — Local AI</div>
            </div>
        </aside>
    );
}
