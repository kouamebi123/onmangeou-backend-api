import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const toBooleanFlag = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes'].includes(value.toLowerCase());
    return undefined;
  });

/**
 * Filtres de decouverte (specification section 3.1).
 *
 * Seuls les filtres declares ici sont acceptes : les parametres de requete sont
 * en liste blanche pour eviter qu'un champ arbitraire n'atteigne la couche SQL
 * (specification sections 10.1 et 22).
 */
export class DiscoverRestaurantsQuery {
  @ApiPropertyOptional({ description: 'Recherche libre : restaurant, plat, quartier ou repere.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @ApiPropertyOptional({ description: 'Latitude du point de reference.' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude du point de reference.' })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  longitude?: number;

  @ApiPropertyOptional({
    description:
      'Rayon de recherche en metres. Ignore sans coordonnees. Sans rayon, le tri distance reste global.',
    minimum: 100,
    maximum: 50000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(50_000)
  radiusMeters?: number;

  @ApiPropertyOptional({ description: 'Commune.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @ApiPropertyOptional({ description: 'Quartier.' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  district?: string;

  @ApiPropertyOptional({ description: 'Restaurants ouverts a cet instant uniquement.' })
  @IsOptional()
  @toBooleanFlag()
  @IsBoolean()
  openNow?: boolean;

  @ApiPropertyOptional({ enum: ['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'RESERVATION'] })
  @IsOptional()
  @IsIn(['DINE_IN', 'TAKEAWAY', 'DELIVERY', 'RESERVATION'])
  service?: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY' | 'RESERVATION';

  @ApiPropertyOptional({ description: "Prix minimum d'un plat, en FCFA entier." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: "Prix maximum d'un plat, en FCFA entier." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ description: 'Au moins un plat vegetarien.' })
  @IsOptional()
  @toBooleanFlag()
  @IsBoolean()
  vegetarian?: boolean;

  @ApiPropertyOptional({ description: 'Au moins un plat halal.' })
  @IsOptional()
  @toBooleanFlag()
  @IsBoolean()
  halal?: boolean;

  @ApiPropertyOptional({ description: 'Terrasse.' })
  @IsOptional()
  @toBooleanFlag()
  @IsBoolean()
  terrace?: boolean;

  @ApiPropertyOptional({ description: 'Climatisation.' })
  @IsOptional()
  @toBooleanFlag()
  @IsBoolean()
  airConditioning?: boolean;

  @ApiPropertyOptional({ description: 'Accessible PMR.' })
  @IsOptional()
  @toBooleanFlag()
  @IsBoolean()
  accessible?: boolean;

  @ApiPropertyOptional({
    enum: ['distance', 'name', 'recent'],
    default: 'distance',
    description: 'Le tri par distance exige des coordonnees.',
  })
  @IsOptional()
  @IsIn(['distance', 'name', 'recent'])
  sort?: 'distance' | 'name' | 'recent';

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({ description: 'Curseur opaque renvoye par la page precedente.' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}
