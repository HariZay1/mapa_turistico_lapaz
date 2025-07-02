import requests

import psycopg2
import logging
import time
import json
import os
import hashlib

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('tourism_extraction.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class LaPazTourismExtractor:
    def __init__(self, db_config):
        self.db_config = db_config
        self.data_dir = "data"
        os.makedirs(self.data_dir, exist_ok=True)
        self.api_endpoints = [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter"
        ]
        self.bbox = (-16.6, -68.2, -16.4, -68.0)
        self.categories = {
            'museo': 'tourism=museum',
            'patrimonio_historico': 'historic=*',
            'teatro': 'amenity=theatre',
            'galeria_arte': 'tourism=gallery',
            'centro_cultural': 'amenity=arts_centre',
            'iglesia': 'building=church',
            'basilica': 'building=cathedral',
            'convento': 'historic=monastery',
            'templo': 'amenity=place_of_worship',
            'mirador': 'tourism=viewpoint',
            'plaza': 'place=square',
            'parque': 'leisure=park',
            'monumento': 'historic=monument',
            'fuente': 'amenity=fountain',
            'mercado': 'amenity=marketplace',
            'mercado_artesanal': 'shop=gift',
            'zona_comercial': 'landuse=commercial',
            'jardin_botanico': 'leisure=garden',
            'reserva_natural': 'leisure=nature_reserve',
            'cerro': 'natural=peak',
            'laguna': 'natural=water',
            'teleferico': 'aerialway=*',
            'estacion_ski': 'sport=skiing',
            'sendero': 'highway=path',
            'centro_folklore': 'tourism=attraction',
            'casa_cultura': 'amenity=community_centre'
        }
        
        
    def run_extraction(self):
        try:
            elements = self.fetch_from_api()
            if not elements:
                logger.info("Intentando con datos de archivo...")
                elements = self.load_from_file('osm_data_sample.json')
            if not elements:
                logger.info("No se pudo obtener ningún dato")
                return False
            places = self.process_elements(elements)
            important_places = self.filter_important_places(places)
            unique_places = self.remove_duplicate_names(important_places)
            return self.save_to_database(unique_places)
        except Exception as e:
            logger.error(f"Error en el proceso: {str(e)}")
            return False

    def remove_duplicate_names(self, places):
        if not places:
            return places
        unique_names = {}
        for place in places:
            name = place['nombre'].strip().lower()
            if name not in unique_names:
                unique_names[name] = place
            else:
                existing_place = unique_names[name]
                if place['rating'] > existing_place['rating']:
                    unique_names[name] = place
        return list(unique_names.values())

    def fetch_from_api(self):
        for endpoint in self.api_endpoints:
            try:
                logger.info(f"Consultando API: {endpoint}")
                elements = []
                for tag in self.categories.values():
                    query = self.build_query(tag)
                    response = requests.post(
                        endpoint,
                        data={'data': query},
                        timeout=90
                    )
                    response.raise_for_status()
                    data = response.json()
                    elements.extend(data.get('elements', []))
                    time.sleep(3)
                self.save_to_file(elements, 'osm_data_latest.json')
                return elements
            except Exception as e:
                logger.warning(f"Error con {endpoint}: {str(e)}")
                continue
        return None

    def build_query(self, tag):
        if '=*' in tag:
            key = tag.split('=')[0]
            return f"""
            [out:json][timeout:90];
            (
              node["{key}"]({self.bbox[0]},{self.bbox[1]},{self.bbox[2]},{self.bbox[3]});
              way["{key}"]({self.bbox[0]},{self.bbox[1]},{self.bbox[2]},{self.bbox[3]});
            );
            out center;
            """
        else:
            return f"""
            [out:json][timeout:90];
            (
              node[{tag}]({self.bbox[0]},{self.bbox[1]},{self.bbox[2]},{self.bbox[3]});
              way[{tag}]({self.bbox[0]},{self.bbox[1]},{self.bbox[2]},{self.bbox[3]});
            );
            out center;
            """

    def load_from_file(self, filename):
        try:
            filepath = os.path.join(self.data_dir, filename)
            if not os.path.exists(filepath):
                return None
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error cargando archivo: {str(e)}")
            return None

    def save_to_file(self, data, filename):
        try:
            filepath = os.path.join(self.data_dir, filename)
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            logger.info(f"Datos guardados en {filename}")
        except Exception as e:
            logger.error(f"Error guardando archivo: {str(e)}")

    def process_elements(self, elements):
        places = []
        for element in elements:
            place = self.process_element(element)
            if place:
                places.append(place)
        return places

    def process_element(self, element):
        try:
            tags = element.get('tags', {})
            name = tags.get('name', '').strip()
            if not name:
                return None
            lat, lon = self.get_coordinates(element)
            if not lat or not lon:
                return None
            place = {
                'nombre': name,
                'categoria': self.get_category(tags),
                'descripcion_corta': self.get_description(tags, name),
                'lat': lat,
                'lon': lon,
                'horario': tags.get('opening_hours', 'Consultar horarios').strip(),
                'telefono': tags.get('phone', '').strip(),
                'sitio_web': tags.get('website', '').strip(),
                'wikidata_id': tags.get('wikidata', '').strip(),
                'osm_id': element.get('id'),
                'osm_type': element.get('type'),
                'fotos': [],
                'rating': self.calculate_rating(tags)
            }
            if place['wikidata_id']:
                self.enrich_with_wikidata(place)
            return place
        except Exception as e:
            logger.error(f"Error procesando elemento: {str(e)}")
            return None

    def get_coordinates(self, element):
        try:
            if element['type'] == 'node':
                return float(element['lat']), float(element['lon'])
            elif 'center' in element:
                return float(element['center']['lat']), float(element['center']['lon'])
            return None, None
        except (KeyError, TypeError, ValueError):
            return None, None

    def get_category(self, tags):
        priority_categories = [
            ('museo', 'tourism=museum'),
            ('mirador', 'tourism=viewpoint'),
            ('iglesia', 'building=church'),
            ('basilica', 'building=cathedral'),
            ('mercado', 'amenity=marketplace'),
            ('plaza', 'place=square'),
            ('patrimonio_historico', 'historic=*'),
            ('teatro', 'amenity=theatre'),
            ('teleferico', 'aerialway=*'),
            ('parque', 'leisure=park'),
            ('monumento', 'historic=monument')
        ]
        for cat, tag in priority_categories:
            key, value = tag.split('=')
            if key in tags:
                if value == '*' or tags[key] == value:
                    return cat
        name = tags.get('name', '').lower()
        if 'bruja' in name or 'hechicería' in name:
            return 'mercado'
        elif 'mirador' in name or 'killi' in name:
            return 'mirador'
        elif 'valle de la luna' in name or 'muela del diablo' in name:
            return 'atraccion_natural'
        elif 'teleférico' in name:
            return 'teleferico'
        return 'otros'

    def get_description(self, tags, name):
        descriptions = {
            'museo': "Museo ubicado en La Paz con exposiciones culturales e históricas",
            'mirador': "Punto panorámico con vistas espectaculares de La Paz y sus alrededores",
            'iglesia': "Templo religioso con valor histórico y arquitectónico",
            'basilica': "Importante basílica con gran valor religioso y arquitectónico",
            'mercado': "Mercado tradicional donde se pueden encontrar productos locales y artesanías",
            'plaza': "Plaza histórica y punto de encuentro en el centro de La Paz",
            'patrimonio_historico': "Sitio de importancia histórica y cultural de La Paz",
            'teatro': "Teatro con programación cultural y espectáculos artísticos",
            'teleferico': "Estación del sistema de teleférico Mi Teleférico de La Paz",
            'parque': "Espacio verde y de recreación en la ciudad",
            'atraccion_natural': "Atracción natural única en los alrededores de La Paz"
        }
        category = self.get_category(tags)
        base_description = descriptions.get(category, "Lugar de interés turístico en La Paz")
        if tags.get('description'):
            return tags['description'].strip()
        return base_description

    def calculate_rating(self, tags):
        score = 3.0
        if 'wikidata' in tags or 'wikipedia' in tags:
            score += 1.5
        if 'tourism' in tags and tags['tourism'] in ['attraction', 'museum', 'viewpoint']:
            score += 1.0
        if 'historic' in tags:
            score += 0.8
        if 'building' in tags and tags['building'] in ['cathedral', 'church']:
            score += 0.7
        if 'amenity' in tags and tags['amenity'] in ['marketplace', 'theatre']:
            score += 0.6
        name = tags.get('name', '').lower()
        iconic_places = ['murillo', 'brujas', 'san francisco', 'valle de la luna', 'teleférico', 'killi']
        if any(iconic in name for iconic in iconic_places):
            score += 1.0
        return min(5.0, max(1.0, round(score, 1)))

    def filter_important_places(self, places):
        if not places:
            return places
        places.sort(key=lambda x: (x['rating'], len(x.get('wikidata_id', ''))), reverse=True)
        category_limits = {
            'museo': 15,
            'mirador': 20,
            'iglesia': 12,
            'basilica': 5,
            'mercado': 8,
            'plaza': 10,
            'patrimonio_historico': 20,
            'teatro': 5,
            'teleferico': 15,
            'parque': 8,
            'atraccion_natural': 15,
            'otros': 15
        }
        filtered_places = []
        category_counts = {}
        for place in places:
            category = place['categoria']
            current_count = category_counts.get(category, 0)
            limit = category_limits.get(category, 10)
            if current_count < limit:
                filtered_places.append(place)
                category_counts[category] = current_count + 1
        return filtered_places

    def enrich_with_wikidata(self, place):
        try:
            params = {
                'action': 'wbgetentities',
                'ids': place['wikidata_id'],
                'props': 'descriptions|claims',
                'languages': 'es',
                'format': 'json'
            }
            response = requests.get(
                "https://www.wikidata.org/w/api.php",
                params=params,
                timeout=15
            )
            if response.status_code == 200:
                data = response.json()
                entity = data.get('entities', {}).get(place['wikidata_id'], {})
                description = entity.get('descriptions', {}).get('es', {}).get('value', '')
                if description:
                    place['descripcion_larga'] = description
                fotos = []
                if 'claims' in entity and 'P18' in entity['claims']:
                    for claim in entity['claims']['P18'][:3]:
                        if 'mainsnak' in claim and 'datavalue' in claim['mainsnak']:
                            filename = claim['mainsnak']['datavalue']['value']
                            image_url = self.get_image_url(filename)
                            if image_url:
                                fotos.append(image_url)
                if fotos:
                    place['fotos'] = fotos
        except Exception as e:
            logger.warning(f"Error con Wikidata para {place['nombre']}: {str(e)}")

    def get_image_url(self, filename):
        try:
            filename_clean = filename.replace(' ', '_')
            md5 = hashlib.md5(filename_clean.encode('utf-8')).hexdigest()
            return f"https://upload.wikimedia.org/wikipedia/commons/{md5[0]}/{md5[0:2]}/{filename_clean}"
        except Exception:
            return None

    def save_to_database(self, places):
        if not places:
            logger.warning("No hay lugares para guardar")
            return False
        conn = None
        try:
            conn = psycopg2.connect(**self.db_config)
            cursor = conn.cursor()
            batch_size = 50
            inserted = 0
            for i in range(0, len(places), batch_size):
                batch = places[i:i + batch_size]
                for place in batch:
                    try:
                        fotos_array = '{' + ','.join([f'"{url}"' for url in place['fotos']]) + '}' if place['fotos'] else '{}'
                        query = """
                            INSERT INTO lugares_turisticos (
                                nombre, categoria, descripcion_corta, descripcion_larga,
                                coordenadas, horario, telefono, sitio_web, rating, fotos,
                                osm_id, osm_type, wikidata_id
                            ) VALUES (
                                %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s,%s),4326), 
                                %s, %s, %s, %s, %s, %s, %s, %s
                            )
                            ON CONFLICT (osm_id, osm_type) DO UPDATE SET
                                nombre = EXCLUDED.nombre,
                                categoria = EXCLUDED.categoria,
                                descripcion_corta = EXCLUDED.descripcion_corta,
                                descripcion_larga = EXCLUDED.descripcion_larga,
                                coordenadas = EXCLUDED.coordenadas,
                                horario = EXCLUDED.horario,
                                telefono = EXCLUDED.telefono,
                                sitio_web = EXCLUDED.sitio_web,
                                rating = EXCLUDED.rating,
                                fotos = EXCLUDED.fotos,
                                wikidata_id = EXCLUDED.wikidata_id
                        """
                        values = [
                            place['nombre'],
                            place['categoria'],
                            place['descripcion_corta'],
                            place.get('descripcion_larga', ''),
                            place['lon'],
                            place['lat'],
                            place['horario'],
                            place['telefono'],
                            place['sitio_web'],
                            place['rating'],
                            fotos_array,
                            place['osm_id'],
                            place['osm_type'],
                            place['wikidata_id']
                        ]
                        cursor.execute(query, values)
                        inserted += 1
                    except Exception as e:
                        logger.warning(f"Error insertando {place['nombre']}: {str(e)}")
                        continue
            conn.commit()
            logger.info(f"Total insertados/actualizados: {inserted}")
            return True
        except Exception as e:
            logger.error(f"Error de base de datos: {str(e)}")
            if conn:
                conn.rollback()
            return False
        finally:
            if conn:
                conn.close()

if __name__ == "__main__":
    db_config = {
        'host': 'localhost',
        'database': 'mapa_turistico_lapaz',
        'user': 'postgres',
        'password': 'ari_2025',
        'port': 5432
    }
    extractor = LaPazTourismExtractor(db_config)
    success = extractor.run_extraction()
    if success:
        print("Extracción completada exitosamente")
    else:
        print("Error en la extracción")
    exit(0 if success else 1)