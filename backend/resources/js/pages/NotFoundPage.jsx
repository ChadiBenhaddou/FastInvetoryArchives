import { Link } from 'react-router';

export default function NotFoundPage() {
    return (
        <div className="space-y-3">
            <h1 className="text-2xl font-semibold">Page introuvable</h1>
            <Link to="/" className="text-amber-700 hover:underline">
                Retour au tableau de bord
            </Link>
        </div>
    );
}
