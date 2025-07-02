import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import {
  Search, MapPin, Info, Camera, Clock, Star,
  Navigation, Menu, X, Globe, Filter, Compass,
  Share2, ChevronRight
} from 'lucide-react';

type Place = {
  id: number;
  nombre: string;
  categoria: string;
  descripcion_corta: string;
  descripcion_larga: string;
  lat: number;
  lng: number;
  horario: string;
  telefono: string;
  sitio_web: string;
  rating: number;
  fotos: string[];
  distancia?: number;
};

type Category = {
  id: string;
  nombre: string;
  icono: React.ComponentType<{ className?: string }>;
  color: string;
  markerColor: string;
};

const App: React.FC = () => {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [searchRadius, setSearchRadius] = useState<number>(1000);
  const [showCategories, setShowCategories] = useState<boolean>(true);
  const [firstLoad, setFirstLoad] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const mapRef = useRef<L.Map | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

 
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

 
  const categories: Category[] = [
    { id: 'all', nombre: 'Todos', icono: Globe, color: 'bg-blue-500', markerColor: '#3498db' },
    { id: 'teatro', nombre: 'Teatros', icono: Info, color: 'bg-purple-500', markerColor: '#9b59b6' },
    { id: 'teleferico', nombre: 'Teleféricos', icono: Navigation, color: 'bg-orange-500', markerColor: '#e67e22' },
    { id: 'mercado', nombre: 'Mercados', icono: Filter, color: 'bg-yellow-500', markerColor: '#f39c12' },
    { id: 'parque', nombre: 'Parques', icono: Camera, color: 'bg-green-500', markerColor: '#27ae60' },
    { id: 'iglesia', nombre: 'Iglesias', icono: Compass, color: 'bg-blue-400', markerColor: '#3498db' },
    { id: 'museo', nombre: 'Museos', icono: Info, color: 'bg-red-500', markerColor: '#e74c3c' },
    { id: 'basilica', nombre: 'Basílicas', icono: Globe, color: 'bg-blue-600', markerColor: '#2980b9' },
    { id: 'mirador', nombre: 'Miradores', icono: Camera, color: 'bg-teal-500', markerColor: '#1abc9c' },
    { id: 'plaza', nombre: 'Plazas', icono: MapPin, color: 'bg-green-400', markerColor: '#2ecc71' },
    { id: 'patrimonio_historico', nombre: 'Patrimonio', icono: Clock, color: 'bg-indigo-500', markerColor: '#8e44ad' }
  ];

  
  useEffect(() => {
    const fetchData = async () => {
      try {
        if (firstLoad) setLoading(true);
        setError(null);

        
        let url = `http://localhost:3001/api/lugares`;
        const params = new URLSearchParams();
        
        if (activeCategory !== 'all') {
          params.append('categoria', activeCategory);
        }
        
        if (searchTerm) {
          params.append('search', searchTerm);
        }

        const queryString = params.toString();
        const finalUrl = queryString ? `${url}?${queryString}` : url;

        const response = await fetch(finalUrl);
        const data = await response.json();
        setPlaces(data.data || []);
      } catch {
        setError('Error al cargar los datos turísticos');
      } finally {
        if (firstLoad) setLoading(false);
        setFirstLoad(false);
      }
    };

    const timer = setTimeout(fetchData, 500);
    return () => clearTimeout(timer);
  }, [activeCategory, searchTerm]);

 
  const centerOnPlace = (place: Place) => {
    if (mapRef.current) {
      mapRef.current.flyTo([place.lat, place.lng], 17, { duration: 1 });
    }
    setSelectedPlace(place);
    if (isMobile) {
      setIsMenuOpen(false);
    }
  };
  
  const generateRoute = (place: Place) => {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`, '_blank');
  };


  const categoryEmojis: Record<string, string> = {
    teatro: "🎭",
    teleferico: "🚡",
    mercado: "🛒",
    parque: "🌳",
    iglesia: "⛪",
    museo: "🏛️",
    basilica: "⛪",
    mirador: "🔭",
    plaza: "🏞️",
    patrimonio_historico: "🏰",
    all: "📍"
  };

  const createMarkerIcon = (category: string, name: string, descripcion_corta?: string) => {
    const categoryData = categories.find(c => c.id === category) || categories[0];
    const emoji = categoryEmojis[category] || "📍";
    return L.divIcon({
      className: 'custom-marker',
      html: `
        <div title="${name} - ${descripcion_corta ? descripcion_corta.replace(/"/g, '&quot;') : ''}" style="display: flex; flex-direction: column; align-items: center; cursor: pointer;">
          <div class="marker-pin" style="background-color: ${categoryData.markerColor}; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); transition: transform 0.2s;">
            <span style="font-size: 18px;">${emoji}</span>
          </div>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      popupAnchor: [0, -18]
    });
  };


  const handleCenterMap = () => {
    mapRef.current?.flyTo([-16.5, -68.15], 13);
  };

  if (loading && firstLoad) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-blue-900 to-indigo-900 text-white">
        <div className="animate-pulse flex flex-col items-center">
          <Compass className="h-16 w-16 mb-4 animate-spin" />
          <h2 className="text-2xl font-bold mb-2">Cargando mapa turístico</h2>
          <p className="text-blue-200">Buscando los mejores lugares de La Paz...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gradient-to-br from-blue-900 to-indigo-900 text-white">
        <div className="bg-white/10 backdrop-blur-md p-6 rounded-xl max-w-md text-center">
          <h2 className="text-xl font-bold mb-2 text-red-400">Error</h2>
          <p className="mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 relative">
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-lg z-20">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <MapPin className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Explora La Paz</h1>
              <p className="text-xs text-blue-100 hidden sm:block">Descubre, explora y vive los mejores rincones de la ciudad maravilla</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-lg bg-white/10 hover:bg-white/20 transition"
            >
              {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        <aside 
          ref={sidebarRef}
          className={`${isMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:relative z-30 w-full md:w-96 h-full bg-white shadow-xl transition-transform duration-300 ease-in-out overflow-y-auto`}
          style={{
            maxWidth: isMobile ? '85%' : '24rem'
          }}
        >
          <div className="p-4 h-full flex flex-col">
            <div className="relative mb-4">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                placeholder="Buscar lugares..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-gray-700">Filtros</h3>
                <button 
                  onClick={() => setShowCategories(!showCategories)}
                  className="text-blue-600 hover:text-blue-800 text-sm flex items-center"
                >
                  {showCategories ? 'Ocultar' : 'Mostrar'} 
                  <ChevronRight className={`h-4 w-4 transition-transform ${showCategories ? 'rotate-90' : ''}`} />
                </button>
              </div>
              {showCategories && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-all ${activeCategory === cat.id ? `${cat.color} text-white shadow-md` : 'bg-gray-100 hover:bg-gray-200'}`}
                    >
                      <cat.icono className="h-4 w-4" />
                      <span className="text-sm whitespace-nowrap">{cat.nombre}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-gray-700">
                  Lugares {places.length > 0 && `(${places.length})`}
                </h3>
              </div>
              {places.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No se encontraron lugares</p>
                  <p className="text-sm">Prueba con otros filtros</p>
                </div>
              ) : (
                <div className="space-y-3 pb-4">
                  {places.map((place) => {
                    const categoria = categories.find(c => c.id === place.categoria) || categories[0];
                    return (
                      <div
                        key={place.id}
                        onClick={() => centerOnPlace(place)}
                        className={`p-3 border rounded-lg cursor-pointer transition-all overflow-hidden ${selectedPlace?.id === place.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                      >
                        <div className="flex items-start space-x-3">
                          <div className={`p-2 rounded-lg ${categoria.color} text-white flex-shrink-0`}>
                            <categoria.icono className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <h4 className="font-medium text-gray-900 truncate">{place.nombre}</h4>
                            <p className="text-sm text-gray-500 mt-1 truncate">{place.descripcion_corta}</p>
                            <div className="flex items-center mt-2 space-x-3">
                              <div className="flex items-center space-x-1 text-yellow-500">
                                <Star className="h-3 w-3 fill-current" />
                                <span className="text-xs">
                                {Number(place.rating) ? Number(place.rating).toFixed(1) : 'N/A'}
                                </span>
                              </div>
                              {place.distancia && (
                                <div className="flex items-center space-x-1 text-blue-500">
                                  <Compass className="h-3 w-3" />
                                  <span className="text-xs whitespace-nowrap">{(place.distancia/1000).toFixed(1)} km</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>

        <main className="flex-1 relative z-0">
          <MapContainer
            center={[-16.5, -68.15]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
            ref={mapRef}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {places.map((place) => (
              <Marker
                key={place.id}
                position={[place.lat, place.lng]}
                icon={createMarkerIcon(place.categoria, place.nombre, place.descripcion_corta)}
                eventHandlers={{
                  click: () => setSelectedPlace(place)
                }}
              >
                <Tooltip 
                  direction="top" 
                  offset={[0, -10]} 
                  opacity={1} 
                  permanent={false}
                >
                  <div style={{ 
                    maxWidth: "250px", 
                    whiteSpace: "normal", 
                    wordWrap: "break-word" 
                  }}>
                    <div style={{ fontWeight: "600", color: "#3b82f6", marginBottom: "4px" }}>
                      {place.nombre}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "#4b5563" }}>
                      {place.descripcion_corta}
                    </div>
                  </div>
                </Tooltip>
              </Marker>
            ))}
          </MapContainer>
        </main>

        {selectedPlace && (
          <div
            className={`fixed z-40 bg-white shadow-2xl transition-all duration-300
      ${isMobile
        ? 'left-0 right-0 bottom-0 top-auto rounded-t-2xl max-h-[80vh] h-[70vh] overflow-y-auto'
        : 'inset-0 md:inset-auto md:top-0 md:right-0 md:h-full min-w-[400px] w-[540px] bg-white md:rounded-l-2xl border-l-4 border-blue-600 overflow-y-auto'
      }`}
          >
            <div className="p-4 md:p-8">
              {isMobile && (
                <div className="flex justify-center mb-2">
                  <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                </div>
              )}

              <button
                onClick={() => setSelectedPlace(null)}
                className="absolute top-3 right-3 p-2 text-gray-400 hover:text-gray-600 transition z-50"
                title="Cerrar"
              >
                <X className="h-6 w-6" />
              </button>

              <div className="flex justify-between items-start mb-4 md:mb-6">
                <div className="flex items-start space-x-3 md:space-x-5">
                  <div className={`p-3 md:p-4 rounded-xl shadow ${categories.find(c => c.id === selectedPlace.categoria)?.color || 'bg-gray-500'} text-white flex-shrink-0`}>
                    {React.createElement(
                      categories.find(c => c.id === selectedPlace.categoria)?.icono || Globe,
                      { className: "h-6 md:h-8 w-6 md:w-8" }
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-xl md:text-3xl text-blue-800 mb-1">{selectedPlace.nombre}</h3>
                    <p className="text-sm md:text-base text-gray-500">{selectedPlace.descripcion_corta}</p>
                  </div>
                </div>
              </div>

              {selectedPlace.fotos && selectedPlace.fotos.length > 0 && (
                <div className="mb-4 md:mb-7 flex justify-center">
                  <img
                    src={selectedPlace.fotos[0]}
                    alt={selectedPlace.nombre}
                    className="rounded-xl md:rounded-2xl object-cover w-full max-h-[300px] md:max-h-[400px] border shadow-lg"
                    style={{ objectFit: 'cover' }}
                  />
                </div>
              )}

              <div className="space-y-4 md:space-y-6 mb-4 md:mb-6">
                <div>
                  <span className="font-semibold text-blue-700">Descripción:</span>
                  <p className="text-sm md:text-base text-gray-700 whitespace-pre-line mt-1">
                    {selectedPlace.descripcion_larga !== undefined &&
                     selectedPlace.descripcion_larga !== null &&
                     String(selectedPlace.descripcion_larga).trim() !== ""
                      ? selectedPlace.descripcion_larga
                      : <span className="text-gray-400">No disponible</span>
                    }
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 text-sm md:text-[15px]">
                  <div>
                    <span className="font-semibold text-blue-700">Categoría:</span> {selectedPlace.categoria || <span className="text-gray-400">No disponible</span>}
                  </div>
                  <div>
                    <span className="font-semibold text-blue-700">Calificación:</span>{" "}
                    <span className="inline-flex items-center gap-1 text-yellow-500">
                      <Star className="h-3 md:h-4 w-3 md:w-4 fill-current" />
                      {Number(selectedPlace.rating) ? Number(selectedPlace.rating).toFixed(1) : <span className="text-gray-400">No disponible</span>}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-blue-700">Horario:</span> {selectedPlace.horario && selectedPlace.horario.trim() !== "" ? selectedPlace.horario : <span className="text-gray-400">No disponible</span>}
                  </div>
                  <div>
                    <span className="font-semibold text-blue-700">Teléfono:</span> {selectedPlace.telefono && selectedPlace.telefono.trim() !== "" ? selectedPlace.telefono : <span className="text-gray-400">No disponible</span>}
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <span className="font-semibold text-blue-700">Sitio web:</span>{" "}
                    {selectedPlace.sitio_web && selectedPlace.sitio_web.trim() !== "" ? (
                      <a href={selectedPlace.sitio_web} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline break-all">
                        {selectedPlace.sitio_web}
                      </a>
                    ) : (
                      <span className="text-gray-400">No disponible</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-blue-700">Coordenadas:</span> {selectedPlace.lat.toFixed(5)}, {selectedPlace.lng.toFixed(5)}
                  </div>
                  {selectedPlace.distancia && (
                    <div>
                      <span className="font-semibold text-blue-700">Distancia:</span> {(selectedPlace.distancia/1000).toFixed(1)} km
                    </div>
                  )}
                </div>
              </div>

              {selectedPlace.fotos && selectedPlace.fotos.length > 1 && (
                <div className="mb-4 md:mb-7">
                  <span className="font-semibold text-blue-700">Galería de fotos:</span>
                  <div className="flex flex-wrap gap-2 md:gap-3 mt-2">
                    {selectedPlace.fotos.slice(1).map((foto, index) => (
                      <img
                        key={index}
                        src={foto}
                        alt={`${selectedPlace.nombre} ${index + 2}`}
                        className="rounded-lg object-cover w-[100px] h-[80px] md:w-[170px] md:h-[120px] border shadow"
                        style={{ objectFit: 'cover' }}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex space-x-3 pt-4 border-t">
                <button
                  onClick={() => generateRoute(selectedPlace)}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition shadow text-sm md:text-base"
                >
                  <Navigation className="h-4 md:h-5 w-4 md:w-5" />
                  <span>Cómo llegar</span>
                </button>
                <button
                  onClick={async () => {
                    if (navigator.share) {
                      try {
                        await navigator.share({
                          title: selectedPlace.nombre,
                          text: selectedPlace.descripcion_corta,
                          url: window.location.href
                        });
                      } catch {
                        alert("No se pudo compartir.");
                      }
                    } else {
                      try {
                        await navigator.clipboard.writeText(`${selectedPlace.nombre}\n${selectedPlace.descripcion_corta}\n${window.location.href}`);
                        alert("Enlace copiado al portapapeles.");
                      } catch {
                        alert("No se pudo copiar el enlace.");
                      }
                    }
                  }}
                  className="flex items-center justify-center p-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg transition shadow"
                  title="Compartir"
                >
                  <Share2 className="h-4 md:h-5 w-4 md:w-5" />
                </button>
                {selectedPlace.sitio_web && (
                  <button
                    onClick={() => window.open(selectedPlace.sitio_web, '_blank')}
                    className="flex items-center justify-center p-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg transition shadow"
                    title="Sitio web"
                  >
                    <Globe className="h-4 md:h-5 w-4 md:w-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className={`fixed top-16 right-6 z-30 flex flex-col space-y-3 pointer-events-none
    ${selectedPlace && isMobile ? 'hidden' : ''}
  `}
      >
        <button
          onClick={handleCenterMap}
          className="p-3 bg-white rounded-full shadow-lg hover:bg-gray-50 hover:shadow-xl transition-all duration-300 border border-gray-200 active:scale-95 pointer-events-auto"
          title="Centrar mapa"
          style={{ minWidth: '48px', minHeight: '48px' }}
        >
          <Globe className="h-6 w-6 text-gray-700" />
        </button>
        {isMobile && !isMenuOpen && (
          <button
            onClick={() => setIsMenuOpen(true)}
            className="p-3 bg-white rounded-full shadow-lg hover:bg-gray-50 hover:shadow-xl transition-all duration-300 border border-gray-200 active:scale-95 pointer-events-auto"
            title="Mostrar menú"
            style={{ minWidth: '48px', minHeight: '48px' }}
          >
            <Menu className="h-6 w-6 text-gray-700" />
          </button>
        )}
      </div>

      {isMenuOpen && isMobile && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </div>
  );
};

export default App;