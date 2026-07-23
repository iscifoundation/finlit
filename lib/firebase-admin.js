// Server-side Firebase ID token verification using Google's public certificates.
// Avoids needing a service account by verifying the JWT signature against Google's x509 certs.
import { importX509, jwtVerify } from 'jose';

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/[email protected]';
let cachedCerts = null;
let cachedCertsAt = 0;

async function fetchCerts() {
  const now = Date.now();
  if (cachedCerts && (now - cachedCertsAt) < 60 * 60 * 1000) return cachedCerts;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error('Failed to fetch Google certs');
  cachedCerts = await res.json();
  cachedCertsAt = now;
  return cachedCerts;
}

export async function verifyFirebaseIdToken(idToken, projectId) {
  if (!idToken) throw new Error('No token provided');
  const projId = projectId || process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projId) throw new Error('Firebase project ID not configured');
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid ID token format');
  const header = JSON.parse(Buffer.from(parts[0], 'base64').toString('utf8'));
  const certs = await fetchCerts();
  const cert = certs[header.kid];
  if (!cert) throw new Error('Unknown token key id');
  const key = await importX509(cert, 'RS256');
  const { payload } = await jwtVerify(idToken, key, {
    issuer: `https://securetoken.google.com/${projId}`,
    audience: projId,
  });
  return payload;
}
