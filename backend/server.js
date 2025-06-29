require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();
const port = process.env.PORT || 3001;

// Seguridad y middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));
app.use(express.json());
app.use(morgan('combined'));

// Limitación de tasa
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use('/api/', limiter);

// PostgreSQL pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'mapa_turistico_lapaz',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'ari_2025',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// 1. Endpoint para obtener todos los lugares con filtros avanzados
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

    res.json({
      success: true,
      data: result.rows.map(place => ({
        ...place,
        fotos: Array.isArray(place.fotos) ? place.fotos : []
      }))
    });
  } catch (error) {
    console.error('Error en /api/lugares:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor' 
    });
  }
});

// 2. Endpoint para datos de un lugar específico
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
    res.json({
      success: true,
      data: {
        ...place,
        fotos: Array.isArray(place.fotos) ? place.fotos : []
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

// 3. Endpoint para búsqueda geográfica avanzada
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
      ${categoryFilter}
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

// Middleware para manejo de errores
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Error interno del servidor' 
  });
});

// Iniciar servidor
app.listen(port, () => {
  console.log(`Servidor API corriendo en http://localhost:${port}`);
});