import os
from qgis.core import (
    QgsProject, QgsVectorLayer, QgsMarkerSymbol, QgsCategorizedSymbolRenderer,
    QgsRendererCategory, QgsCoordinateReferenceSystem, QgsRectangle,
    QgsDataSourceUri, QgsVectorLayerSimpleLabeling,
    QgsPalLayerSettings, QgsTextFormat, QgsTextBufferSettings,
    QgsRasterLayer
)
from qgis.PyQt.QtGui import QColor, QFont

class SimplifiedTourismMap:
    def __init__(self):
        self.project = QgsProject.instance()
        self.categories = [
            ('teatro', '#9b59b6', 'Teatro'),
            ('teleferico', '#e67e22', 'Teleférico'),
            ('mercado', '#f39c12', 'Mercado'),
            ('parque', '#27ae60', 'Parque'),
            ('iglesia', '#3498db', 'Iglesia'),
            ('museo', '#e74c3c', 'Museo'),
            ('basilica', '#2980b9', 'Basílica'),
            ('mirador', '#1abc9c', 'Mirador'),
            ('plaza', '#2ecc71', 'Plaza'),
            ('patrimonio_historico', '#8e44ad', 'Patrimonio Histórico'),
            ('otros', '#95a5a6', 'Otros')
        ]

    def setup_project(self):
        self.project.clear()
        self.project.setCrs(QgsCoordinateReferenceSystem('EPSG:4326'))
        self.project.setTitle("Mapa Turístico Simplificado de La Paz")

    def load_basemap(self):
        url = "type=xyz&url=https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        basemap = QgsRasterLayer(url, "OpenStreetMap", "wms")
        if basemap.isValid():
            self.project.addMapLayer(basemap)
            return basemap
        return None

    def load_tourism_layer(self):
        uri = QgsDataSourceUri()
        uri.setConnection(
            "localhost", 
            "5432",
            "mapa_turistico_lapaz",
            "postgres",
            "ari_2025"
        )
        uri.setDataSource("public", "lugares_turisticos", "coordenadas")
        layer = QgsVectorLayer(uri.uri(), "Lugares Turísticos La Paz", "postgres")
        if layer.isValid():
            self.project.addMapLayer(layer)
            return layer
        return None

    def apply_tourism_style(self, layer):
        if not layer:
            return
        categories = []
        for cat_id, color, label in self.categories:
            symbol = QgsMarkerSymbol.createSimple({
                'name': 'circle',
                'color': color,
                'size': '4.0',
                'outline_color': 'white',
                'outline_width': '0.5'
            })
            category = QgsRendererCategory(cat_id, symbol, label)
            categories.append(category)
        renderer = QgsCategorizedSymbolRenderer('categoria', categories)
        layer.setRenderer(renderer)
        self.setup_labels(layer)
        layer.triggerRepaint()

    def setup_labels(self, layer):
        settings = QgsPalLayerSettings()
        settings.fieldName = 'nombre'
        settings.isExpression = False
        settings.placement = QgsPalLayerSettings.AroundPoint
        settings.dist = 2.0
        text_format = QgsTextFormat()
        text_format.setFont(QFont("Arial", 8))
        text_format.setSize(8)
        text_format.setColor(QColor(0, 0, 0))
        buffer = QgsTextBufferSettings()
        buffer.setEnabled(True)
        buffer.setSize(1.0)
        buffer.setColor(QColor(255, 255, 255))
        text_format.setBuffer(buffer)
        settings.setFormat(text_format)
        layer.setLabeling(QgsVectorLayerSimpleLabeling(settings))
        layer.setLabelsEnabled(True)

    def zoom_to_la_paz(self):
        try:
            from qgis.utils import iface
            canvas = iface.mapCanvas()
            la_paz_extent = QgsRectangle(-68.25, -16.65, -68.00, -16.35)
            canvas.setExtent(la_paz_extent)
            canvas.refresh()
        except:
            pass

    def run(self):
        self.setup_project()
        self.load_basemap()
        tourism_layer = self.load_tourism_layer()
        if tourism_layer:
            self.apply_tourism_style(tourism_layer)
            self.zoom_to_la_paz()

if __name__ == "__console__":
    map = SimplifiedTourismMap()
    map.run()