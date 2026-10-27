import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DevicesPage from './pages/DevicesPage';
import ImportPage from './pages/ImportPage';
import BoxesPage from './pages/BoxesPage';
import BoxDetailPage from './pages/BoxDetailPage';
import SearchPage from './pages/SearchPage';
import ConflictsPage from './pages/ConflictsPage';
import BackupPage from './pages/BackupPage';
import UsersPage from './pages/UsersPage';
import NotFoundPage from './pages/NotFoundPage';

function RequireAuth({ children, role }) {
    const { user } = useAuth();
    if (user === undefined) return null; // session check in progress
    if (!user) return <Navigate to="/login" replace />;
    if (role && user.role !== role) return <Navigate to="/" replace />;
    return children;
}

const admin = (element) => <RequireAuth role="admin">{element}</RequireAuth>;

const router = createBrowserRouter([
    { path: '/login', element: <LoginPage /> },
    {
        path: '/',
        element: (
            <RequireAuth>
                <Layout />
            </RequireAuth>
        ),
        children: [
            { index: true, element: <DashboardPage /> },
            { path: 'import', element: <ImportPage /> },
            { path: 'boxes', element: <BoxesPage /> },
            { path: 'boxes/:id', element: <BoxDetailPage /> },
            { path: 'search', element: <SearchPage /> },
            { path: 'conflicts', element: admin(<ConflictsPage />) },
            { path: 'devices', element: admin(<DevicesPage />) },
            { path: 'backup', element: admin(<BackupPage />) },
            { path: 'users', element: admin(<UsersPage />) },
            { path: '*', element: <NotFoundPage /> },
        ],
    },
]);

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <AuthProvider>
            <RouterProvider router={router} />
        </AuthProvider>
    </StrictMode>,
);
