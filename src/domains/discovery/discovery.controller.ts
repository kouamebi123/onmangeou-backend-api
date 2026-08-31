import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentActor, OptionalActor, OptionalAuth } from '../../common/auth/auth.decorators';
import type { AuthenticatedActor } from '../../common/auth/authenticated-actor';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import type { PageResult } from '../../common/pagination/cursor';
import { DiscoveryService, type RestaurantDetail, type RestaurantSummary } from './discovery.service';
import { DiscoverRestaurantsQuery } from './dto/discovery.dto';

/**
 * Decouverte publique.
 *
 * La decouverte fonctionne sans compte (principe non negociable 2) ; un jeton
 * valide enrichit simplement la reponse avec les favoris.
 */
@ApiTags('Decouverte')
@Controller({ version: '1' })
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('discovery/restaurants')
  @OptionalAuth()
  @RateLimit({
    name: 'discovery.search',
    rules: [
      { dimension: 'ip', limit: 300, windowSeconds: 300 },
      { dimension: 'device', limit: 300, windowSeconds: 300 },
    ],
  })
  @ApiOperation({
    summary: 'Rechercher des restaurants',
    description:
      "Carte et liste consomment le meme endpoint. Le tri par distance exige latitude et longitude et utilise l'index geospatial.",
  })
  async discover(
    @Query() query: DiscoverRestaurantsQuery,
    @OptionalActor() actor: AuthenticatedActor | undefined,
  ): Promise<PageResult<RestaurantSummary>> {
    return this.discovery.discover(query, actor?.userId);
  }

  @Get('restaurants/:slug')
  @OptionalAuth()
  @ApiOperation({ summary: 'Consulter une fiche restaurant et son menu publie' })
  async detail(
    @Param('slug') slug: string,
    @OptionalActor() actor: AuthenticatedActor | undefined,
  ): Promise<RestaurantDetail> {
    return this.discovery.getBySlug(slug, actor?.userId);
  }

  @Get('search/suggestions')
  @OptionalAuth()
  @RateLimit({
    name: 'discovery.suggestions',
    rules: [{ dimension: 'ip', limit: 600, windowSeconds: 300 }],
  })
  @ApiOperation({ summary: 'Suggestions de recherche sur les restaurants et les plats' })
  async suggestions(
    @Query('q') term: string,
  ): Promise<Array<{ type: 'restaurant' | 'dish'; label: string; slug?: string }>> {
    return this.discovery.suggest(term ?? '');
  }

  @Get('favorites')
  @ApiOperation({ summary: 'Lister mes restaurants favoris' })
  async favorites(@CurrentActor() actor: AuthenticatedActor): Promise<RestaurantSummary[]> {
    return this.discovery.listFavorites(actor.userId);
  }

  @Post('favorites/:restaurantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ajouter un restaurant aux favoris' })
  async addFavorite(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('restaurantId', ParseUUIDPipe) establishmentId: string,
  ): Promise<void> {
    await this.discovery.addFavorite(actor.userId, establishmentId);
  }

  @Delete('favorites/:restaurantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirer un restaurant des favoris' })
  async removeFavorite(
    @CurrentActor() actor: AuthenticatedActor,
    @Param('restaurantId', ParseUUIDPipe) establishmentId: string,
  ): Promise<void> {
    await this.discovery.removeFavorite(actor.userId, establishmentId);
  }
}
