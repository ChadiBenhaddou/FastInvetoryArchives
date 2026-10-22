import { NavLink, Outlet } from 'react-router';
import { Archive, LayoutDashboard, LogOut, Smartphone, Upload, Users } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content ?? '';

// Sections are added here as deliverables land (import, boxes, review, search...).
const NAV = [
    { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
    { to: '/import', label: 'Import', icon: Upload },
    { to: '/devices', label: 'Appareils', icon: Smartphone, role: 'admin' },
    { to: '/users', label: 'Utilisateurs', icon: Users, role: 'admin' },
];

export default function Layout() {
    const { user, logout } = useAuth();

    return (
        <div className="flex h-full">
            <aside className="flex w-60 shrink-0 flex-col bg-stone-900 text-stone-200">
                <div className="flex items-center gap-2 px-5 py-5">
                    <Archive className="size-6 text-amber-400" />
                    <span className="font-semibold leading-tight">{meta('app-name')}</span>
                </div>

                <nav className="flex-1 space-y-1 px-3">
                    {NAV.filter((item) => !item.role || item.role === user.role).map(({ to, label, icon: Icon, end }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className={({ isActive }) =>
                                `flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                                    isActive ? 'bg-stone-700 text-white' : 'hover:bg-stone-800'
                                }`
                            }
                        >
                            <Icon className="size-4" />
                            {label}
                        </NavLink>
                    ))}
                </nav>

                <div className="border-t border-stone-800 px-5 py-4 text-sm">
                    <div className="font-medium text-white">{user.name}</div>
                    <div className="text-stone-400">{user.role_label}</div>
                    <button
                        onClick={logout}
                        className="mt-3 flex items-center gap-2 text-stone-400 hover:text-white"
                    >
                        <LogOut className="size-4" /> Se déconnecter
                    </button>
                    <div className="mt-3 text-xs text-stone-500">Version {meta('app-version')}</div>
                </div>
            </aside>

            <main className="flex-1 overflow-y-auto p-8">
                <Outlet />
            </main>
        </div>
    );
}
