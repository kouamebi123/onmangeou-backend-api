import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Response, NextFunction } from 'express';
import { v7 as uuidv7 } from 'uuid';
import { DEVICE_INSTALL_HEADER, REQUEST_ID_HEADER, type AppRequest } from './request-context';

/**
 * Attribue un identifiant de correlation a chaque requete et le renvoie au client
 * (specification section 10.1).
 *
 * Un identifiant fourni par le client est accepte uniquement s'il ressemble a un
 * UUID : sans ce filtre, une valeur arbitraire polluerait les journaux et
 * ouvrirait une injection dans les outils de collecte.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: AppRequest, response: Response, next: NextFunction): void {
    const incoming = request.header(REQUEST_ID_HEADER);
    const requestId = incoming && isUuidLike(incoming) ? incoming : uuidv7();

    request.requestId = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    const deviceInstallId = request.header(DEVICE_INSTALL_HEADER);
    if (deviceInstallId && deviceInstallId.length <= 128) {
      request.deviceInstallId = deviceInstallId;
    }

    next();
  }
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
