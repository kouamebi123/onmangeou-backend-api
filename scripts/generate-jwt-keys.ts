/**
 * Genere une paire de cles ES256 pour la signature des access tokens.
 * Usage local et CI uniquement : en production les cles proviennent du
 * gestionnaire de secrets et sont rotees (specification section 22).
 */
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

process.stdout.write(`JWT_PRIVATE_KEY=${Buffer.from(privatePem).toString('base64')}\n`);
process.stdout.write(`JWT_PUBLIC_KEY=${Buffer.from(publicPem).toString('base64')}\n`);
