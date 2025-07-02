require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

const port = process.env.PORT || 3001;


app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));
app.use(express.json());
app.use(morgan('combined'));


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 100 
});


app.use('/api/', limiter);
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'mapa_turistico_lapaz',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'ari_2025',
  max: 20, // máximo de conexiones
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});
const cache = new Map();
app.get('/api/lugares', async (req, res) => {
  try {
    const { 
      categoria, 
      search, 
      min_rating, 
      max_distance, 
      lat, 
      lng,
      limit = 50,
      page = 1
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query;
    let params = [];
    let paramIndex = 1;
    
    
    if (lat && lng && max_distance) {
     
      query = `
        SELECT 
          id, nombre, categoria, descripcion_corta, descripcion_larga,
          ST_X(coordenadas) as lng, ST_Y(coordenadas) as lat,
          ST_Distance(coordenadas::geography, ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex+1}), 4326)::geography) as distancia,
          horario, telefono, sitio_web, rating, fotos,
          osm_id, osm_type, wikidata_id, created_at
        FROM lugares_turisticos
        WHERE ST_DWithin(
          coordenadas::geography, 
          ST_SetSRID(ST_MakePoint($${paramIndex}, $${paramIndex+1}), 4326)::geography,
          $${paramIndex+2}
        )
      `;
      params.push(parseFloat(lng), parseFloat(lat), parseFloat(max_distance));
      paramIndex += 3;
    } else {
     
      query = `
        SELECT 
          id, nombre, categoria, descripcion_corta, descripcion_larga,
          ST_X(coordenadas) as lng, ST_Y(coordenadas) as lat,
          horario, telefono, sitio_web, rating, fotos,
          osm_id, osm_type, wikidata_id, created_at
        FROM lugares_turisticos
        WHERE 1=1
      `;
    }
    
    if (categoria && categoria !== 'all') {
      query += ` AND categoria = $${paramIndex++}`;
      params.push(categoria);
    }
    
    if (search && search.trim() !== "") {
      query += ` AND (nombre ILIKE $${paramIndex++} OR descripcion_corta ILIKE $${paramIndex++})`;
      params.push(`%${search}%`, `%${search}%`);
    }
    
    if (min_rating) {
      query += ` AND rating >= $${paramIndex++}`;
      params.push(parseFloat(min_rating));
    }
   
    query += `
      ORDER BY ${lat && lng ? 'distancia' : 'rating DESC, nombre'}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(parseInt(limit), offset);
    
    
    const result = await pool.query(query, params);
    
    
    let countQuery = 'SELECT COUNT(*) FROM lugares_turisticos WHERE 1=1';
    const countParams = [];
    let countParamIndex = 1;
    
    if (categoria && categoria !== 'all') {
      countQuery += ` AND categoria = $${countParamIndex++}`;
      countParams.push(categoria);
    }
    
    if (search) {
      countQuery += ` AND (nombre ILIKE $${countParamIndex++} OR descripcion_corta ILIKE $${countParamIndex++})`;
      countParams.push(`%${search}%`, `%${search}%`);
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);
    
    res.json({
      success: true,
      data: result.rows.map(place => ({
        ...place,
        fotos: Array.isArray(place.fotos) ? place.fotos : []
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error en /api/lugares:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});
app.get('/api/estadisticas', async (req, res) => {
  try {
    
    if (cache.has('estadisticas')) {
      return res.json({ 
        success: true, 
        fromCache: true,
        data: cache.get('estadisticas') 
      });
    }
    
    const [categoriesRes, topRatedRes, densityRes, typesRes] = await Promise.all([
      pool.query(`
        SELECT categoria, COUNT(*) as count, AVG(rating) as avg_rating
        FROM lugares_turisticos
        GROUP BY categoria
        ORDER BY count DESC
      `),
      pool.query(`
        SELECT nombre, categoria, rating, ST_X(coordenadas) as lng, ST_Y(coordenadas) as lat
        FROM lugares_turisticos
        ORDER BY rating DESC
        LIMIT 5
      `),
      pool.query(`
        SELECT 
          ST_X(ST_Centroid(ST_Collect(coordenadas))) as center_lng,
          ST_Y(ST_Centroid(ST_Collect(coordenadas))) as center_lat,
          COUNT(*) as total
        FROM lugares_turisticos
      `),
      pool.query(`
        SELECT 
          jsonb_object_agg(tipo, count) as types_distribution
        FROM (
          SELECT 
            CASE 
              WHEN categoria IN ('museo', 'teatro', 'basilica') THEN 'cultural'
              WHEN categoria IN ('parque', 'mirador') THEN 'naturaleza'
              WHEN categoria IN ('plaza', 'mercado') THEN 'urbano'
              ELSE 'otros'
            END as tipo,
            COUNT(*) as count
          FROM lugares_turisticos
          GROUP BY tipo
        ) subq
      `)
    ]);
    
    const stats = {
      categories: categoriesRes.rows,
      topRated: topRatedRes.rows,
      density: densityRes.rows[0],
      typesDistribution: typesRes.rows[0].types_distribution,
      lastUpdated: new Date().toISOString()
    };
   
    cache.set('estadisticas', stats, 3600000);
    
    res.json({ 
      success: true, 
      fromCache: false,
      data: stats 
    });
    
  } catch (error) {
    console.error('Error en /api/estadisticas:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});
app.get('/api/lugares/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT 
        id, nombre, categoria, descripcion_corta, descripcion_larga,
        ST_X(coordenadas) as lng, ST_Y(coordenadas) as lat,
        horario, telefono, sitio_web, rating, fotos,
        osm_id, wikidata_id,
        to_char(created_at, 'YYYY-MM-DD') as fecha_creacion
      FROM lugares_turisticos
      WHERE id = $1
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Lugar no encontrado' 
      });
    }
    
    const place = result.rows[0];
    
    
    const nearbyQuery = `
      SELECT 
        id, nombre, categoria,
        ST_X(coordenadas) as lng, ST_Y(coordenadas) as lat,
        ST_Distance(coordenadas::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distancia
      FROM lugares_turisticos
      WHERE id != $3
      ORDER BY distancia
      LIMIT 5
    `;
    
    const nearbyResult = await pool.query(nearbyQuery, [place.lng, place.lat, id]);
    
    res.json({
      success: true,
      data: {
        ...place,
        fotos: Array.isArray(place.fotos) ? place.fotos : [],
        lugares_cercanos: nearbyResult.rows
      }
    });
    
  } catch (error) {
    console.error('Error en /api/lugares/:id:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});


app.get('/api/busqueda-geo', async (req, res) => {
  try {
    const { lat, lng, radius = 1000, categories } = req.query;
    
    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren coordenadas (lat, lng)'
      });
    }
    
    let categoryFilter = '';
    const params = [lng, lat, radius];
    
    if (categories && categories !== 'all') {
      const categoryList = categories.split(',');
      categoryFilter = `AND categoria IN (${categoryList.map((_, i) => `$${i + 4}`).join(',')})`;
      params.push(...categoryList);
    }
    
    const query = `
      SELECT 
        id, nombre, categoria, descripcion_corta, descripcion_larga,
        ST_X(coordenadas) as lng, ST_Y(coordenadas) as lat,
        ST_Distance(coordenadas::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distancia,
        horario, telefono, sitio_web, rating, fotos,
        osm_id, osm_type, wikidata_id, created_at
      FROM lugares_turisticos
      WHERE ST_DWithin(
        coordenadas::geography, 
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
    `;
    
    const result = await pool.query(query, params);
    
    res.json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });
    
  } catch (error) {
    console.error('Error en /api/busqueda-geo:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});


app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Error interno del servidor' 
  });
});


app.listen(port, () => {
  console.log(`Servidor API corriendo en http://localhost:${port}`);
});