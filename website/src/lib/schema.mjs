// Structured data (schema.org JSON-LD). Only what the page shows: no ratings, reviews, prices
// or customers (none exist yet).
import { isMissing, site } from '../config/site.mjs';

const abs = (path) => new URL(path, site.url).href;

export function organizationLd() {
    const org = {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        '@id': abs('/#organisation'),
        name: site.orgName,
        url: abs('/'),
        logo: abs('/logo.png'),
    };
    if (site.email) org.email = site.email;
    if (site.phone) org.telephone = `+${site.phoneIntl}`;
    if (site.city || site.address) {
        org.address = { '@type': 'PostalAddress', addressCountry: 'MA', ...(site.city && { addressLocality: site.city }), ...(site.address && { streetAddress: site.address }) };
    }
    return isMissing(site.orgName) ? null : org;
}

export function websiteLd() {
    return { '@context': 'https://schema.org', '@type': 'WebSite', '@id': abs('/#site'), name: site.productName, url: abs('/'), inLanguage: 'fr-MA' };
}

export function breadcrumbLd(items) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: abs(item.href) })),
    };
}

/** Only properties that are true and visible on the product page. */
export function softwareLd() {
    return {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: site.productName,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Windows 10, Windows 11, Ubuntu 22.04, Ubuntu 24.04, Android 7+',
        inLanguage: ['fr', 'ar'],
        url: abs('/logiciel-inventaire-archives/'),
        description:
            "Inventaire hors ligne d'archives papier : capture sur téléphone Android, transfert par câble USB, lecture OCR arabe et français, extraction des champs, recherche et inventaire Excel.",
        ...(organizationLd() && { publisher: { '@id': abs('/#organisation') } }),
    };
}

export function serviceLd({ name, description, path }) {
    return {
        '@context': 'https://schema.org',
        '@type': 'Service',
        name,
        description,
        serviceType: 'Développement d\'applications sur mesure',
        areaServed: { '@type': 'Country', name: 'Maroc' },
        url: abs(path),
        ...(organizationLd() && { provider: { '@id': abs('/#organisation') } }),
    };
}

export function faqLd(items) {
    return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    };
}

export function articleLd(post, path) {
    return {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: post.title,
        description: post.description,
        datePublished: post.pubDate.toISOString(),
        dateModified: (post.updatedDate ?? post.pubDate).toISOString(),
        inLanguage: 'fr-MA',
        mainEntityOfPage: abs(path),
        author: { '@type': post.author === site.orgName ? 'Organization' : 'Person', name: post.author },
        ...(organizationLd() && { publisher: { '@id': abs('/#organisation') } }),
        keywords: [post.primaryKeyword, ...post.secondaryKeywords].join(', '),
    };
}
