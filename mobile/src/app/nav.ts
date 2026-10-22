// Minimal router on top of the History API, so the Android back button
// (wired in App.tsx) walks back through screens.
import { useEffect, useState } from 'react';

export type Route =
    | { name: 'home' }
    | { name: 'newBox' }
    | { name: 'capture'; code: string }
    | { name: 'box'; code: string }
    | { name: 'boxes' }
    | { name: 'export' }
    | { name: 'history' }
    | { name: 'admin' };

const HOME: Route = { name: 'home' };
const listeners = new Set<(r: Route) => void>();
let current: Route = HOME;
let depth = 0; // number of screens above home

function emit(route: Route) {
    current = route;
    listeners.forEach((l) => l(route));
}

window.addEventListener('popstate', (e) => {
    depth = e.state?.depth ?? 0;
    emit((e.state?.route as Route) ?? HOME);
});
history.replaceState({ route: HOME, depth: 0 }, '');

export function navigate(route: Route, { replace = false } = {}) {
    if (replace) {
        history.replaceState({ route, depth }, '');
    } else {
        depth++;
        history.pushState({ route, depth }, '');
    }
    emit(route);
}

/** Back to the home screen, dropping the screens in between from the back stack. */
export function goHome() {
    if (depth > 0) history.go(-depth);
}

export const back = () => history.back();
export const isHome = () => depth === 0;

export function useRoute(): Route {
    const [route, setRoute] = useState(current);
    useEffect(() => {
        listeners.add(setRoute);
        return () => void listeners.delete(setRoute);
    }, []);
    return route;
}
