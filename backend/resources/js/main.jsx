import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router';
import { AuthProvider, useAuth } from './auth/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import DevicesPage from './pages/DevicesPage';
import ImportPage from './pages/ImportPage';
import UsersPage from './pages/UsersPage';
import NotFoundPage from './pages/NotFoundPage';

function RequireAuth({ children, role }) {
    const { user } = useAuth();
    if (user === undefined) return null; // session check in progress
    if (!user) return <Navigate to="/login" replace />;
    if (role && user.role !== role) return <Navigate to="/" replace />;
    return children;
}

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
            {
                path: 'devices',
                element: (
                    <RequireAuth role="admin">
                        <DevicesPage />
                    </RequireAuth>
                ),
            },
            {
                path: 'users',
                element: (
                    <RequireAuth role="admin">
                        <UsersPage />
                    </RequireAuth>
                ),
            },
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
