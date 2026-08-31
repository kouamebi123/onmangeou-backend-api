-- Extensions requises par la specification technique maitre.
-- PostGIS  : geography(Point, 4326) et index GiST (section 15.1).
-- unaccent : normalisation des accents pour la recherche (section 15.3).
-- pg_trgm  : recherche approximative par trigrammes (section 15.3).
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;
