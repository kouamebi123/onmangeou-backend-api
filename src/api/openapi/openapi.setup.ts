import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';

/**
 * Contrat OpenAPI 3 genere depuis le code (specification section 10.4).
 *
 * Le document genere est la source unique du contrat : les clients web, mobile et
 * back-office generent leurs types depuis ce fichier, versionne dans le depot.
 * Ecrire un contrat a la main a cote du code garantit une derive silencieuse.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('OnMangeOu API')
    .setDescription(
      [
        'API de la plateforme OnMangeOu : decouverte de restaurants et gestion d\'etablissement en Cote d\'Ivoire.',
        '',
        'Conventions transverses :',
        '- Toutes les reponses de succes utilisent l\'enveloppe `{ "data": ..., "meta": { "requestId", "nextCursor" } }`.',
        '- Toutes les erreurs utilisent le format RFC 7807 `application/problem+json` avec un champ `code` stable.',
        '- Les montants sont des entiers de FCFA transmis en chaine de caracteres : le franc CFA n\'a pas de sous-unite.',
        '- Les dates sont en UTC ISO 8601. L\'affichage se fait dans le fuseau Africa/Abidjan.',
        '- Les numeros de telephone sont normalises au format E.164, par exemple `+2250701020304`.',
        '- Les ecritures critiques exigent l\'en-tete `Idempotency-Key`.',
        '- La pagination est par curseur opaque : `cursor` et `limit`, jamais par decalage.',
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .setContact('OnMangeOu', 'https://onmangeou.ci', 'contact@onmangeou.ci')
    .addServer('http://localhost:3000', 'Developpement local')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Access token ES256 obtenu via /v1/auth/otp/verify. Duree de vie courte, renouvele par /v1/auth/refresh.',
      },
      'bearer',
    )
    .addGlobalParameters({
      name: 'X-Request-Id',
      in: 'header',
      required: false,
      description: 'Identifiant de correlation. Genere par le serveur si absent, et toujours renvoye.',
      schema: { type: 'string', format: 'uuid' },
    })
    .addTag('Decouverte', 'Recherche et fiches restaurant, accessibles sans compte')
    .addTag('Authentification', 'Connexion par telephone et code a usage unique')
    .addTag('Mon compte', 'Profil, sessions et suppression de compte')
    .addTag('Restaurant - organisation', 'Organisation, etablissements, horaires et services')
    .addTag('Restaurant - catalogue', 'Menus, plats, prix et disponibilite')
    .addTag('Sante', 'Sondes de vivacite et de disponibilite')
    .build();

  return SwaggerModule.createDocument(app, config, { operationIdFactory: buildOperationId });
}

export function mountSwaggerUi(app: INestApplication, document: OpenAPIObject): void {
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha', operationsSorter: 'alpha' },
    customSiteTitle: 'OnMangeOu API',
  });
}

/**
 * Identifiants d'operation stables et lisibles.
 *
 * Le defaut de Nest concatene le nom de la classe et de la methode, ce qui
 * produit des noms de client generes instables des qu'un controleur est renomme.
 */
function buildOperationId(controllerKey: string, methodKey: string): string {
  const resource = controllerKey.replace(/Controller$/, '');
  return `${lowerFirst(resource)}_${methodKey}`;
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
